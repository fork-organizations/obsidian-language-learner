<template>
    <div id="langr-data">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig">
            <NSpace justify="end" style="margin-bottom: 10px;">
                <NButton @click="onAddWord" strong secondary type="info">
                    {{ t("Learning New Words") }}
                </NButton>
                <NButton @click="expressions" strong secondary type="info">
                    {{ t("Refresh Word Database") }}
                </NButton>
                <NButton @click="resetFilters" strong secondary type="warning" v-if="hasActiveFilters">
                    Reset Filters
                </NButton>
            </NSpace>

            <!-- 搜索区域 -->
            <NSpace vertical style="margin-bottom: 10px;">
                <NSpace align="center" style="display: grid; grid-template-columns: auto 2fr auto;">
                    <span style="display: inline-block; width: 80px; font-size: 1.1em; font-weight: bold;">
                        Word:
                    </span>
                    <NInput
                        size="small"
                        v-model:value="searchParams.expression"
                        placeholder="Search by word..."
                        clearable
                        @update:value="onSearchChange"
                    />
                </NSpace>

                <NSpace align="center" style="display: grid; grid-template-columns: auto 2fr auto;">
                    <span style="display: inline-block; width: 80px; font-size: 1.1em; font-weight: bold;">
                        Meaning:
                    </span>
                    <NInput
                        size="small"
                        v-model:value="searchParams.meaning"
                        placeholder="Search by meaning..."
                        clearable
                        @update:value="onSearchChange"
                    />
                </NSpace>

                <NSpace align="center">
                    <span style="display: inline-block; width: 80px; font-size: 1.1em; font-weight: bold;">
                        Status:
                    </span>
                    <select
                        v-model="searchParams.status"
                        @change="onSearchChange"
                        style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc;"
                    >
                        <option :value="undefined">All</option>
                        <option v-for="(status, index) in statusMap" :key="index" :value="index">
                            {{ status }}
                        </option>
                    </select>

                    <span style="display: inline-block; width: 80px; font-size: 1.1em; font-weight: bold; margin-left: 20px;">
                        Type:
                    </span>
                    <select
                        v-model="searchParams.t"
                        @change="onSearchChange"
                        style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc;"
                    >
                        <option :value="undefined">All</option>
                        <option value="WORD">Word</option>
                        <option value="PHRASE">Phrase</option>
                    </select>
                </NSpace>
            </NSpace>

            <!-- 标签筛选 -->
            <NSpace style="margin: 10px 0;" align="center" v-if="tags.length > 0">
                <span style="display: inline-block; width: 70px; font-size: 1.1em; font-weight: bold; margin-right: 5px;">
                    Tags:
                </span>
                <select v-model="mode" style="margin-right: 10px;">
                    <option value="and">And</option>
                    <option value="or">Or</option>
                </select>
                <NTag v-for="(tag, i) in tags" size="small" checkable v-model:checked="checkedTags[i]" :key="i">
                    {{ "#" + tag }}
                </NTag>
            </NSpace>
            <NDataTable
                ref="table"
                size="small"
                :loading="loading"
                :data="data"
                :columns="collumns"
                :row-key="makeRowKey"
                :remote="true"
                :virtual-scroll-x="true"
                @update:checked-row-keys="handleCheck"
                :pagination="paginationConfig"
                @update:page="handlePageChange"
            />
        </NConfigProvider>
        <LearnPanelModal @onChangeWord="onChangeWord" @on-change-show="onChangeShow" :show="showWordModal" :word="word"/>
    </div>
</template>

<script setup lang="ts">
import {moment, Notice} from "obsidian";
import {
    h,
    ref,
    reactive,
    computed,
    watch,
    watchEffect,
    getCurrentInstance,
    Suspense,
    defineAsyncComponent, defineComponent, onMounted,
} from "vue";
import {
    NConfigProvider,
    NDataTable,
    NTag,
    GlobalThemeOverrides,
    darkTheme,
    NSpace,
    NInput,
    NButton,
} from "naive-ui";
import {t} from "@/lang/helper";

import type {DataTableColumns, DataTableRowKey} from "naive-ui";
import type PluginType from "@/plugin";
import LearnPanelModal from "@/views/LearnPanelModal.vue";
import WordMore from "@comp/WordMore.vue";

const plugin = getCurrentInstance().appContext.config.globalProperties
    .plugin as PluginType;

const themeConfig: GlobalThemeOverrides = {
    DataTable: {
        fontSizeSmall: plugin.constants.platform === "mobile" ? "10px" : "14px",
        tdPaddingSmall: "8px",
    },
};

const loading = ref(true);

// 切换明亮/黑暗模式
const theme = computed(() => {
    return plugin.store.dark ? darkTheme : null;
});

interface Row {
    expr: string;
    status: string;
    meaning: string;
    tags: string[];
    date: string;
    senNum: number;
    noteNum: number;
}

const showWordModal = ref(false);
const word = ref({})

const statusMap = [
    t("Ignore"),
    t("Learning"),
    t("Familiar"),
    t("Known"),
    t("Learned"),
];

const pagination = ref({
    total: 0,
    pageCount: 0,
    pageSize: 15,
    page: 1,
});

// 搜索和筛选状态
const searchParams = ref({
    expression: '',
    meaning: '',
    status: undefined as number | undefined,
    t: undefined as string | undefined
});

// 排序状态
const sortParams = ref({
    field: 'date' as 'expression' | 'meaning' | 'status' | 'date',
    order: 'desc' as 'asc' | 'desc'
});

// 改变显示新增显示状态
const onChangeShow = (state: boolean) => {
    showWordModal.value = state
}

const onChangeWord = () => {
    expressions();
}

const onAddWord = () => {
    word.value = {
        expression: null,
        meaning: null,
        status: 0,
        t: "WORD",
        tags: [],
        notes: [],
        sentences: [],
    };
    showWordModal.value = true;
}

// 重置搜索和筛选
const resetFilters = () => {
    searchParams.value = {
        expression: '',
        meaning: '',
        status: undefined,
        t: undefined
    };
    sortParams.value = {
        field: 'date',
        order: 'desc'
    };
    pagination.value.page = 1;
    expressions();
}

// 检查是否有激活的筛选条件
const hasActiveFilters = computed(() => {
    return !!(
        searchParams.value.expression ||
        searchParams.value.meaning ||
        searchParams.value.status !== undefined ||
        searchParams.value.t
    );
});

// 搜索变化处理（防抖）
let searchTimeout: NodeJS.Timeout | null = null;
const onSearchChange = () => {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
        pagination.value.page = 1; // 重置到第一页
        expressions();
    }, 500); // 500ms 防抖
};

// 处理排序
const handleSort = (field: 'expression' | 'meaning' | 'status' | 'date') => {
    if (sortParams.value.field === field) {
        // 切换排序方向
        sortParams.value.order = sortParams.value.order === 'asc' ? 'desc' : 'asc';
    } else {
        // 新字段，默认降序
        sortParams.value.field = field;
        sortParams.value.order = 'desc';
    }
    pagination.value.page = 1;
    expressions();
};

// 分页配置
const paginationConfig = computed(() => ({
    pageSize: pagination.value.pageSize,
    page: pagination.value.page,
    pageCount: pagination.value.pageCount,
    itemCount: pagination.value.total,
    showSizePicker: true,
    pageSizes: [15, 20, 30],
    onChange: (page: number) => {
        pagination.value.page = page;
        expressions();
    },
    onUpdatePageSize: (pageSize: number) => {
        pagination.value.pageSize = pageSize;
        pagination.value.page = 1; // 重置到第一页
        expressions();
    },
    prefix: () => `Total ${pagination.value.total} items`
}));

function handlePageChange(currentPage: number) {
    if (!loading.value) {
        expressions()
    }
}

const expressions = async () => {
    loading.value = true;

    try {
        // 将 page 从 1-based 转换为 0-based（后端使用 0-based）
        const currentPage = pagination.value.page - 1;

        // 构建搜索参数
        const search: any = {};
        if (searchParams.value.expression) {
            search.expression = searchParams.value.expression;
        }
        if (searchParams.value.meaning) {
            search.meaning = searchParams.value.meaning;
        }
        if (searchParams.value.status !== undefined) {
            search.status = searchParams.value.status;
        }
        if (searchParams.value.t) {
            search.t = searchParams.value.t;
        }

        // 构建排序参数
        const sort: any = {};
        if (sortParams.value.field) {
            sort[sortParams.value.field] = sortParams.value.order;
        }

        let response = await plugin.storage.DB().getAllExpressionSimple(
            true,  // ignores
            sort,   // sort
            Object.keys(search).length > 0 ? search : undefined,  // search
            {
                pageSize: pagination.value.pageSize,
                page: currentPage
            }
        );

        console.log('Response:', response);

        // 更新分页信息
        pagination.value.total = response.total;
        pagination.value.pageCount = Math.ceil(response.total / pagination.value.pageSize);

        // 只显示当前页的数据
        data.value = response.data.map((entry: any): Row => {
            let date = moment(entry.date);

            return {
                expr: entry.expression,
                status: statusMap[entry.status],
                meaning: entry.meaning,
                tags: entry.tags,
                noteNum: entry.note_num,
                senNum: entry.sen_num,
                date: date.format("YYYY-MM-DD"),
            };
        });

        console.log('Data loaded:', data.value.length, 'items');

        // 只在第一次加载时获取标签
        if (tags.value.length === 0) {
            tags.value = await plugin.storage.DB().getTags();
            checkedTags.value = Array(tags.value.length).map((_) => false);
        }
    } catch (error) {
        console.error("Failed to load expressions:", error);
        new Notice("Failed to load data");
        data.value = [];
        pagination.value.total = 0;
        pagination.value.pageCount = 0;
    } finally {
        loading.value = false;
    }
}

onMounted(() => { expressions(); });

let data = ref<Row[]>([]);

let table = ref<InstanceType<typeof NDataTable>>(null);
let mode = ref("and");
let tags = ref<string[]>([]);
let checkedTags = ref<boolean[]>([]);
let selectedTags = ref<string[]>([]);
watchEffect(() => {
    let selected = tags.value.filter((tag, i) => checkedTags.value[i]);
    table.value?.filter({
        tags: selected,
    });
    selectedTags.value = selected;
});

// 搜索框
let searchText = ref("");
watch(searchText, (text) => {
    table.value?.filter({
        expr: text
    });
});

// 选中行
let rowKeysRef = ref<DataTableRowKey[]>([]);
let makeRowKey = (row: Row) => row.expr;

function handleCheck(rowKeys: DataTableRowKey[]) {
    rowKeysRef.value = rowKeys;
}

let collumns = reactive<DataTableColumns<Row>>([
    // {
    //     type: "selection",
    // },
    {
        type: "expand",
        expandable: (row: Row) => row.noteNum + row.senNum > 0,

        renderExpand: (row: Row) => {
            return h("div", "11")
            // return h(WordMore, {
            //     word: row.expr,
            //     key: `word-more-${row.expr}`
            // });
        },
    },
    // 表达
    {
        title: "Expr",
        key: "expr",
        minWidth: "80",
        sorter: () => {
            // 自定义排序处理
            handleSort('expression');
            return false; // 返回 false 阻止默认排序
        },
        renderSorterIcon() {
            if (sortParams.value.field === 'expression') {
                return sortParams.value.order === 'asc' ? '↑' : '↓';
            }
            return '↕';
        }
    },
    // 含义
    {
        title: "Meaning",
        key: "meaning",
        align: "left",
        minWidth: 140,
        sorter: () => {
            handleSort('meaning');
            return false;
        },
        renderSorterIcon() {
            if (sortParams.value.field === 'meaning') {
                return sortParams.value.order === 'asc' ? '↑' : '↓';
            }
            return '↕';
        }
    },
    // 标签
    {
        title: "Tags",
        key: "tags",
        render(row) {
            return row.tags.map((tag: string) =>
                h(
                    NTag,
                    {
                        style: {marginRight: "6px"},
                        type: "info",
                        size: "small",
                    },
                    {default: () => tag}
                )
            );
        },
        filter(value, row) {
            if (selectedTags.value.length === 0) {
                return true;
            }
            return mode.value === "and"
                ? selectedTags.value.every((tag) => row.tags.contains(tag))
                : selectedTags.value.some((tag) => row.tags.contains(tag));
        },
    },
    // 学习状态
    {
        title: "Status",
        key: "status",
        maxWidth: 100,
        minWidth: 90,
        defaultFilterOptionValues: statusMap.slice(1),
        filterOptions: [
            {label: t("Ignore"), value: t("Ignore")},
            {label: t("Learning"), value: t("Learning")},
            {label: t("Familiar"), value: t("Familiar")},
            {label: t("Known"), value: t("Known")},
            {label: t("Learned"), value: t("Learned")},
        ],
        filter(value, row) {
            return row.status === value;
        },
        sorter: () => {
            handleSort('status');
            return false;
        },
        renderSorterIcon() {
            if (sortParams.value.field === 'status') {
                return sortParams.value.order === 'asc' ? '↑' : '↓';
            }
            return '↕';
        }
    },
    // 修改日期
    {
        title: "Date",
        key: "date",
        maxWidth: 100,
        align: "center",
        sorter: () => {
            handleSort('date');
            return false;
        },
        renderSorterIcon() {
            if (sortParams.value.field === 'date') {
                return sortParams.value.order === 'asc' ? '↑' : '↓';
            }
            return '↕';
        }
    },
    // 操作
    {
        title: "Action",
        key: "action",
        maxWidth: 100,
        align: "center",
        render(row) {
            return [
                h(
                    NButton,
                    {
                        type: "info",
                        size: "small",
                        strong: true,
                        secondary: true,
                        onClick: async () => {
                            word.value = await plugin.storage.DB()?.getExpression(row.expr)
                            showWordModal.value = true;
                        }
                    },
                    {default: () => t("Edit")}
                ),

            ];
        },
    },
]);


</script>

<style lang="scss">
#langr-data {
    #data-tags {
        display: flex;
    }

    .n-data-table-filter {
        width: 19px;
    }

    .n-data-table-th--filterable {
        width: 19px;

    }

    .n-data-table__pagination {
        justify-content: center;
    }

    .data-more {
        h2 {
            margin: 0.5em 0;
        }

        .data-notes {
            p {
                white-space: pre-line;
                margin: 0.5em 5px;
            }
        }

        .data-sens {
            .data-sen {
                margin-bottom: 5px;
                border: 1px solid gray;
                border-radius: 5px;

                p {
                    &:first-child {
                        font-style: italic;
                    }

                    margin: 0.5em 5px;
                }
            }
        }
    }
}
</style>
