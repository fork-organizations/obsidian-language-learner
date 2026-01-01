import {
    ArticleWords,
    CountInfo,
    ExpressionInfo,
    ExpressionInfoSimple,
    Phrase,
    ReviewWord,
    Sentence,
    Span,
    Word,
    WordCount,
    WordsPhrase,
    WordType,
} from "@/storage/interface";
import Plugin from "@/plugin";
import { ElectronStorage } from "@qiyangxy/tedb-electron-storage";
import { createAutomaton } from "ac-auto";
import { moment } from "obsidian";
import path from "path";
import * as tedb from "tedb";
import { ExpressionsTable, SentencesTable, Tables } from "../types";
import StorageDrive from "@/storage/drive";

export default class LocalFileStorageDrive extends StorageDrive {
    plugin: Plugin;
    storageName: string;
    storagePath: string;
    storageDir: string;
    basePath: string;

    private tables: Map<string, tedb.Datastore> = new Map();

    // db: Database = null

    constructor(plugin: Plugin) {
        super();
        // todo 待优化不确定目前是否有更好的获取当前根目录方法
        this.basePath = (app.vault.adapter as any).getBasePath();

        this.plugin = plugin;
        this.storageName = plugin.settings.storage.storage_name;
        this.storageDir = "";
        this.storagePath = path.join(this.basePath, this.storageDir);
    }

    init() {
        this.tables
            .set(
                Tables.EXPRESSION,
                new tedb.Datastore({
                    storage: new ElectronStorage(
                        this.storageName,
                        Tables.EXPRESSION,
                        this.storagePath
                    ),
                })
            )
            .set(
                Tables.SENTENCE,
                new tedb.Datastore({
                    storage: new ElectronStorage(
                        this.storageName,
                        Tables.SENTENCE,
                        this.storagePath
                    ),
                })
            );
        // this.initIndex();
    }

    initIndex() {
        this.tables.get(Tables.EXPRESSION).ensureIndex({
            fieldName: "expression",
        })
    }

    close(): void {
        this.tables = new Map();
    }

    async countSeven(): Promise<WordCount[]> {
        let spans: Span[] = [];
        spans = [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const start = moment().subtract(6, "days").startOf("day");
            const from = start.add(i, "days");
            return {
                from: from.unix(),
                to: from.endOf("day").unix(),
            };
        });

        const res: WordCount[] = [];

        // 对每一天计算
        for (const span of spans) {
            // 当日
            const today = new Array(5).fill(0);
            let expressions = (await this.tables
                .get(Tables.EXPRESSION)
                .find({
                    t: WordType.WORD,
                    date: { $gte: span.from, $lte: span.to },
                })
                .exec()) as ExpressionsTable[];

            expressions.forEach((item) => {
                today[item.status]++;
            });

            // 累计
            const accumulated = new Array(5).fill(0);
            expressions = (await this.tables
                .get(Tables.EXPRESSION)
                .find({
                    t: WordType.WORD,
                    date: { $lte: span.to },
                })
                .exec()) as ExpressionsTable[];

            expressions.forEach((item) => {
                accumulated[item.status]++;
            });

            res.push({ today, accumulated });
        }

        return res;
    }

    destroyAll(): Promise<void> {
        this.tables.forEach((item) => {
            item.remove();
        });
        return null;
    }

    exportDB(): Promise<void> {
        return Promise.resolve(undefined);
    }

    async getAllExpressionSimple(
        ignores?: boolean
    ): Promise<ExpressionInfoSimple[]> {
        const expressions = (await this.tables
            .get(Tables.EXPRESSION)
            .find({ status: { $gt: ignores ? -1 : 0 } })
            .sort({ $created_at: -1 })
            .exec()) as ExpressionsTable[];

        const res: ExpressionInfoSimple[] = [];
        for (const expr of expressions) {
            res.push({
                expression: expr.expression,
                status: expr.status,
                meaning: expr.meaning,
                t: expr.t,
                tags: expr.tags,
                note_num: expr.notes.length,
                sen_num: expr.sentences.length,
                date: expr.date,
            });
        }

        return res;
    }

    async getCount(): Promise<CountInfo> {
        const word_count = (await this.tables
            .get(Tables.EXPRESSION)
            .count({ t: WordType.WORD })
            .exec()) as number;
        const phrase_count = (await this.tables
            .get(Tables.EXPRESSION)
            .count({ t: WordType.PHRASE })
            .exec()) as number;

        return {
            word_count: [word_count],
            phrase_count: [phrase_count],
        };
    }

    async $(keyworkd: string): Promise<ExpressionInfo> {
        const hasExists = (await this.tables
            .get(Tables.EXPRESSION)
            .find({
                expression: keyworkd.toLocaleLowerCase(),
            })
            .sort({ $created_at: -1 })
            .limit(1)
            .exec()) as ExpressionsTable[];

        if (hasExists === null || hasExists.length === 0) {
            return null;
        }

        const expression: ExpressionsTable = hasExists[0];

        return {
            expression: expression.expression,
            meaning: expression.meaning,
            status: expression.status,
            t: expression.t,
            notes: expression.notes,
            sentences: (await this.tables
                .get(Tables.SENTENCE)
                .find({ _id: expression._id })
                .sort({ $created_at: 1 })
                .exec()) as SentencesTable[],
            tags: expression.tags,
        };
    }

    async getExpressionAfter(time: string): Promise<ReviewWord[]> {
        const unixStamp = moment.utc(time).unix();
        const expressions = (await this.tables
            .get(Tables.EXPRESSION)
            .find({
                status: { $gt: 0 },
                date: { $gte: unixStamp },
            })
            .sort({ $created_at: -1 })
            .exec()) as ExpressionsTable[];

        const res: ReviewWord[] = [];
        for (const expr of expressions) {
            const orWhere = [];

            for (const sentence of expr.sentences) {
                orWhere.push({ _id: sentence });
            }

            let sentences: SentencesTable[] = [];
            if (orWhere.length > 0) {
                sentences = (await this.tables
                    .get(Tables.SENTENCE)
                    .find({ $or: orWhere })
                    .sort({ $created_at: 1 })
                    .exec()) as SentencesTable[];
            }

            for (let item of sentences) {
                res.push({
                    title: expr.expression,
                    expression: item.sentence.replace(
                        expr.expression,
                        `==${expr.expression}==`
                    ),
                    meaning: item.trans,
                    status: expr.status,
                    t: WordType.PHRASE,
                    notes: [],
                    sentences: [],
                    tags: expr.tags,
                });
            }

            res.push({
                title: expr.expression,
                expression: expr.expression,
                meaning: expr.meaning,
                status: expr.status,
                t: expr.t,
                notes: expr.notes,
                sentences,
                tags: expr.tags,
            });
        }
        return res;
    }

    async getExpressionsSimple(
        keywords: string[]
    ): Promise<ExpressionInfoSimple[]> {
        const orWhere = keywords.map((e) => {
            return { expression: e.toLowerCase() };
        });

        const expressions = (await this.tables
            .get(Tables.EXPRESSION)
            .find({ $or: orWhere })
            .sort({ $created_at: -1 })
            .exec()) as ExpressionsTable[];

        const res: ExpressionInfoSimple[] = [];
        await expressions.forEach(async (v) => {
            res.push({
                expression: v.expression,
                meaning: v.meaning,
                status: v.status,
                t: v.t,
                tags: v.tags,
                sen_num: v.sentences.length,
                note_num: v.notes.length,
                date: v.date,
            });
        });

        return res;
    }

    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        const storedPhrases = new Map<string, number>();
        (
            (await this.tables
                .get(Tables.EXPRESSION)
                .find({
                    t: WordType.PHRASE,
                })
                .sort({ $created_at: -1 })
                .exec()) as ExpressionsTable[]
        ).forEach((expr) => {
            storedPhrases.set(expr.expression, expr.status);
        });

        const storedWords: Word[] = [];
        const expressionsTable = await this.tables
            .get(Tables.EXPRESSION)
            .find({
                t: WordType.WORD,
            })
            .exec() as ExpressionsTable[]

        expressionsTable.forEach(expr => {
            if (payload.words.includes(expr.expression.toLowerCase())) {
                storedWords.push({
                    text: expr.expression,
                    status: expr.status
                });
            }
        })

        console.log( storedWords, 'storedWords')


        const ac = await createAutomaton([...storedPhrases.keys()]);
        const searchedPhrases = (await ac.search(payload.article)).map(
            (match) => {
                return {
                    text: match[1],
                    status: storedPhrases!.get(match[1]),
                    offset: match[0],
                } as Phrase;
            }
        );

        return { words: storedWords, phrases: searchedPhrases };
    }

    async getTags(): Promise<string[]> {
        const expressions = (await this.tables
            .get(Tables.EXPRESSION)
            .find({})
            .sort({ $created_at: -1 })
            .exec()) as ExpressionsTable[];

        const tags: string[] = [];
        expressions.forEach((item) => {
            tags.push(...item.tags);
        });

        return [...tags.unique().values()];
    }

    async getExpression(keyword: string): Promise<ExpressionInfo> {
        keyword = keyword.toLowerCase();
        const expressions = (await this.tables
            .get(Tables.EXPRESSION)
            .find({ expression: keyword })
            .sort({ $created_at: -1 })
            .exec()) as ExpressionsTable[];

        if (!expressions || expressions.length <= 0) {
            return null;
        }

        const expr = expressions[0];

        const sentences = (await this.tables
            .get(Tables.SENTENCE)
            .find({
                expression: expr.expression,
            })
            .sort({ $created_at: -1 })
            .exec()) as SentencesTable[];

        return {
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            notes: expr.notes as string[],
            sentences,
            tags: expr.tags,
        };
    }

    importDB(data: any): Promise<void> {
        return Promise.resolve(undefined);
    }

    open(): Promise<void> {
        this.init();
        return null;
    }

    async postExpression(payload: ExpressionInfo): Promise<number> {
        let expression: ExpressionsTable | null = null;
        const hasExists = (await this.tables
            .get(Tables.EXPRESSION)
            .find({
                expression: payload.expression,
            })
            .sort({ $created_at: -1 })
            .limit(1)
            .exec()) as ExpressionsTable[];

        // update sentences
        const sentences = new Set<string>();
        for (const sen of payload.sentences) {
            const sens = (await this.tables
                .get(Tables.SENTENCE)
                .find({ text: sen.sentence })

                .sort({ $created_at: 1 })
                .exec()) as SentencesTable[];
            let sentence = null;
            if (sens.length > 0) {
                sentence = sens[0];
            } else {
                sentence = await this.tables.get(Tables.SENTENCE).insert(sen);
            }

            sentences.add(sentence._id);
        }

        const data = {
            expression: payload.expression,
            meaning: payload.meaning,
            status: payload.status,
            t: payload.t,
            tags: [...new Set<string>(payload.tags).values()],
            connections: [] as string[],
            notes: payload.notes,
            sentences: [...sentences.values()],
            date: moment().unix(),
        };

        // 如果之前不存在情况新增
        if (hasExists === null || hasExists.length === 0) {
            expression = (await this.tables
                .get(Tables.EXPRESSION)
                .insert(data)) as ExpressionsTable;
        } else {
            expression = hasExists[0];
            this.tables
                .get(Tables.EXPRESSION)
                .update({ _id: expression._id }, { $set: data });
        }

        return 200;
    }

    async postIgnoreWords(payload: string[]): Promise<void> {
        const promises: Array<Promise<any>> = [];
        const uniqueWords = [...new Set(payload.map((item) => item.toLowerCase()))];

        uniqueWords.forEach((doc) => {
            promises.push(
                this.tables.get(Tables.EXPRESSION).update(
                    {
                        expression: doc,
                    },
                    {
                        $set: {
                            expression: doc,
                            meaning: "",
                            status: 0,
                            t: WordType.WORD,
                            connections: [],
                            tags: [],
                            notes: [],
                            sentences: [],
                            date: moment().unix(),
                        },
                    },
                    { exactObjectFind: true, upsert: true }
                )
            );
        });

        await Promise.all(promises);

        return;
    }

    async tryGetSen(text: string): Promise<Sentence> {
        const stored = (await this.tables
            .get(Tables.SENTENCE)
            .find({ text: text })
            .sort({ $created_at: 1 })
            .exec()) as Sentence[];
        if (stored.length > 0) {
            return null;
        }

        return stored[0];
    }

    async removeExpression(expression: string): Promise<boolean> {
        const state = await this.tables.get(Tables.EXPRESSION).remove({
            expression: expression,
        });

        return state > 0;
    }
}
