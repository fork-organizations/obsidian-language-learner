<template>
    <NModal
        :show="show"
        @update:show="$emit('update:show', $event)"
        :mask-closable="true"
        :closable="true"
        :preset="'card'"
        :title="word || 'Word Details'"
        :style="{ width: '80%', maxWidth: '800px' }"
        :segmented="{ content: 'soft', footer: 'soft' }"
    >
        <template #header-extra>
            <NSpace>
                <NButton
                    v-if="notes.length > 0 || sentences.length > 0"
                    size="small"
                    type="info"
                    ghost
                    @click="copyAll"
                >
                    <template #icon>
                        <span style="font-size: 1.2em">📋</span>
                    </template>
                    {{ t("Copy All") }}
                </NButton>
                <NButton
                    size="small"
                    type="warning"
                    ghost
                    @click="handleEdit"
                >
                    <template #icon>
                        <span style="font-size: 1.2em">✏️</span>
                    </template>
                    {{ t("Edit") }}
                </NButton>
            </NSpace>
        </template>

        <!-- 加载状态 -->
        <NSpin :show="loading">
            <!-- 空状态 -->
            <NEmpty
                v-if="!loading && notes.length === 0 && sentences.length === 0"
                :description="t('No notes or sentences for this word')"
                size="large"
            >
                <template #icon>
                    <span style="font-size: 3em">📝</span>
                </template>
            </NEmpty>

            <!-- 内容区域 -->
            <div v-else class="word-more-content">
                <!-- Notes 部分 -->
                <div v-if="notes.length > 0" class="section notes-section">
                    <div class="section-header">
                        <h3>{{ t("Notes") }}</h3>
                        <NButton
                            size="tiny"
                            text
                            type="info"
                            @click="copyNotes"
                        >
                            📋 {{ t("Copy") }}
                        </NButton>
                    </div>
                    <div class="notes-list">
                        <div
                            v-for="(note, index) in notes"
                            :key="index"
                            class="note-item"
                        >
                            <p class="note-text">{{ note }}</p>
                        </div>
                    </div>
                </div>

                <!-- Sentences 部分 -->
                <div v-if="sentences.length > 0" class="section sentences-section">
                    <div class="section-header">
                        <h3>{{ t("Sentences") }}</h3>
                        <NButton
                            size="tiny"
                            text
                            type="info"
                            @click="copySentences"
                        >
                            📋 {{ t("Copy") }}
                        </NButton>
                    </div>
                    <div class="sentences-list">
                        <div
                            v-for="(sen, index) in sentences"
                            :key="sen.id || sen.sentence || index"
                            class="sentence-item"
                        >
                            <p
                                class="sentence-text"
                                v-html="sen.sentence"
                            ></p>
                            <p
                                v-if="sen.trans"
                                class="sentence-trans"
                                v-html="sen.trans"
                            ></p>
                            <p
                                v-if="sen.origin"
                                class="sentence-origin"
                                v-html="sen.origin"
                            ></p>
                        </div>
                    </div>
                </div>
            </div>
        </NSpin>

        <template #footer>
            <NSpace justify="end">
                <NButton @click="$emit('update:show', false)">
                    {{ t("Close") }}
                </NButton>
            </NSpace>
        </template>
    </NModal>
</template>

<script setup lang='ts'>
import { ref, watch, onMounted } from 'vue';
import { NModal, NButton, NSpace, NEmpty, NSpin, useMessage } from 'naive-ui';
import { getCurrentInstance } from 'vue';
import PluginType from "@/plugin";
import { t } from '@/lang/helper';

const plugin = getCurrentInstance().appContext.config.globalProperties.plugin as PluginType;
const message = useMessage();

const props = defineProps<{
    word: string;
    show: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:show', value: boolean): void;
    (e: 'edit'): void;
}>();

const sentences = ref<any[]>([]);
const notes = ref<string[]>([]);
const loading = ref(false);

async function load() {
    if (!props.word) {
        sentences.value = [];
        notes.value = [];
        return;
    }

    loading.value = true;
    try {
        console.log("load word more", props.word);
        const data = await plugin.storage.DB().getExpression(props.word);
        notes.value = data?.notes || [];
        sentences.value = (data?.sentences || []).map((sen: any) => {
            return {
                ...sen,
                sentence: highlight(sen.sentence, props.word)
            };
        });
    } catch (error) {
        console.error("Failed to load word details:", error);
        sentences.value = [];
        notes.value = [];
        message.error(t("Failed to load word details"));
    } finally {
        loading.value = false;
    }
}

watch(() => props.word, () => {
    if (props.show) {
        load();
    }
}, { immediate: true });

watch(() => props.show, (newVal) => {
    if (newVal) {
        load();
    }
});

function highlight(text: string, word: string) {
    if (!text) return text;

    const expr = word.toLowerCase();
    const exprRegex = new RegExp(`(${expr})`, 'gi');
    text = text.replace(exprRegex, '<mark>$1</mark>');

    return text;
}

// 复制功能
function copyNotes() {
    const text = notes.value.join('\n\n');
    copyToClipboard(text, t("Notes copied"));
}

function copySentences() {
    const text = sentences.value
        .map(sen => {
            let parts = [sen.sentence?.replace(/<mark>|<\/mark>/g, '')];
            if (sen.trans) parts.push(sen.trans);
            if (sen.origin) parts.push(sen.origin);
            return parts.join('\n');
        })
        .join('\n\n');
    copyToClipboard(text, t("Sentences copied"));
}

function copyAll() {
    const parts: string[] = [];

    if (notes.value.length > 0) {
        parts.push(`=== ${t("Notes")} ===`);
        parts.push(notes.value.join('\n\n'));
    }

    if (sentences.value.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push(`=== ${t("Sentences")} ===`);
        parts.push(
            sentences.value
                .map(sen => {
                    let senParts = [sen.sentence?.replace(/<mark>|<\/mark>/g, '')];
                    if (sen.trans) senParts.push(sen.trans);
                    if (sen.origin) senParts.push(sen.origin);
                    return senParts.join('\n');
                })
                .join('\n\n')
        );
    }

    const text = parts.join('\n\n');
    copyToClipboard(text, t("All content copied"));
}

function copyToClipboard(text: string, successMsg: string) {
    navigator.clipboard.writeText(text).then(() => {
        message.success(successMsg);
    }).catch(() => {
        message.error(t("Failed to copy"));
    });
}

function handleEdit() {
    emit('edit');
    emit('update:show', false);
}
</script>

<style lang="scss" scoped>
.word-more-content {
    .section {
        margin-bottom: 24px;

        &:last-child {
            margin-bottom: 0;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--n-divider-color);

            h3 {
                margin: 0;
                font-size: 1.2em;
                color: var(--n-text-color);
                font-weight: 600;
            }
        }

        .notes-list {
            .note-item {
                padding: 12px;
                margin-bottom: 8px;
                background: var(--n-color-modal);
                border-radius: 6px;
                border-left: 3px solid var(--n-primary-color);

                &:last-child {
                    margin-bottom: 0;
                }

                .note-text {
                    white-space: pre-line;
                    margin: 0;
                    line-height: 1.6;
                    user-select: text;
                }
            }
        }

        .sentences-list {
            .sentence-item {
                padding: 12px;
                margin-bottom: 8px;
                background: var(--n-color-modal);
                border-radius: 6px;
                border: 1px solid var(--n-border-color);

                &:last-child {
                    margin-bottom: 0;
                }

                p {
                    margin: 6px 0;
                    line-height: 1.6;
                    user-select: text;

                    &:first-child {
                        font-style: italic;
                        color: var(--n-text-color);

                        mark {
                            font-weight: bold;
                            background-color: var(--n-primary-color);
                            color: white;
                            padding: 2px 4px;
                            border-radius: 2px;
                        }
                    }
                }

                .sentence-trans {
                    color: var(--n-text-color-2);
                    font-size: 0.95em;
                }

                .sentence-origin {
                    color: var(--n-text-color-3);
                    font-size: 0.9em;
                }
            }
        }
    }
}
</style>
