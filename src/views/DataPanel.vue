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
                    <NSelect
                        v-model:value="searchParams.status"
                        :options="statusOptions"
                        size="small"
                        style="width: 120px;"
                        clearable
                        @update:value="onSearchChange"
                    />

                    <span style="display: inline-block; width: 80px; font-size: 1.1em; font-weight: bold; margin-left: 20px;">
                        Type:
                    </span>
                    <NSelect
                        v-model:value="searchParams.t"
                        :options="typeOptions"
                        size="small"
                        style="width: 120px;"
                        clearable
                        @update:value="onSearchChange"
                    />
                </NSpace>
            </NSpace>

            <!-- 标签筛选 -->
            <NSpace style="margin: 10px 0;" align="center" v-if="tags.length > 0">
                <span style="display: inline-block; width: 70px; font-size: 1.1em; font-weight: bold; margin-right: 5px;">
                    Tags:
                </span>
                <NSelect
                    v-model:value="mode"
                    :options="[
                        { label: 'And', value: 'and' },
                        { label: 'Or', value: 'or' }
                    ]"
                    size="small"
                    style="width: 80px; margin-right: 10px;"
                />
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
                :scroll-x="1000"
                @update:checked-row-keys="handleCheck"
                :pagination="paginationConfig"
                @update:page="handlePageChange"
                @update:page-count="handlePageCountChange"
                @update:filters="handleFilterChange"
                @update:sorter="handleSorterChange"
                :single-line="false"
                :bordered="false"
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
     onMounted,
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
    NSelect,
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
    statusIndex: number;
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

// 状态颜色映射
const statusColorMap: Record<number, string> = {
    0: '#d1d5db',  // Ignore - 灰色
    1: '#f59e0b',  // Learning - 橙色
    2: '#3b82f6',  // Familiar - 蓝色
    3: '#22c55e',  // Known - 绿色
    4: '#10b981',  // Learned - 深绿色
};

// 状态下拉选项
const statusOptions = computed(() => [
    { label: "All", value: undefined },
    ...statusMap.map((status, index) => ({ label: status, value: index }))
]);

// 类型下拉选项
const typeOptions = [
    { label: "All", value: undefined },
    { label: "Word", value: "WORD" },
    { label: "Phrase", value: "PHRASE" }
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
    field: 'date' as 'status' | 'date',
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
const handleSort = async (field: 'status' | 'date') => {
    console.log('Sorting by:', field, 'current params:', sortParams.value);

    if (sortParams.value.field === field) {
        // 切换排序方向
        sortParams.value.order = sortParams.value.order === 'asc' ? 'desc' : 'asc';
    } else {
        // 新字段，默认降序
        sortParams.value.field = field;
        sortParams.value.order = 'desc';
    }

    pagination.value.page = 1;
    console.log('After sort:', sortParams.value);

    // 强制重新加载数据
    await expressions();
};

// 分页配置
const paginationConfig = computed(() => ({
    pageSize: pagination.value.pageSize,
    page: pagination.value.page,
    pageCount: pagination.value.pageCount,
    itemCount: pagination.value.total,
    showSizePicker: true,
    pageSizes: [15, 20, 30, 50],
    onChange: (page: number) => {
        pagination.value.page = page;
        expressions();
    },
    onUpdatePageSize: (pageSize: number) => {
        pagination.value.pageSize = pageSize;
        pagination.value.page = 1; // 重置到第一页
        expressions();
    },
    prefix: (paginationInfo: any) => `Total ${paginationInfo.itemCount} items`
}));

function handlePageChange(currentPage: number) {
    console.log('Page changed to:', currentPage);
    if (!loading.value) {
        expressions();
    }
}

function handlePageCountChange(newPageCount: number) {
    console.log('Page count changed to:', newPageCount);
    pagination.value.pageCount = newPageCount;
}

// 处理筛选器变化
function handleFilterChange(filters: any) {
    console.log('Filters changed:', filters);

    // 更新搜索参数中的状态筛选
    if (filters.status && filters.status.length > 0) {
        // 如果选择了状态筛选，更新搜索参数
        // 注意：这里我们使用第一个选中的状态值
        // 如果需要多选支持，需要修改后端接口
        searchParams.value.status = filters.status[0] as number;
    } else {
        searchParams.value.status = undefined;
    }

    // 重置到第一页并重新加载数据
    pagination.value.page = 1;
    expressions();
}

// 处理排序变化
async function handleSorterChange(sorter: any) {
    console.log('Sorter changed:', sorter);

    if (sorter) {
        const field = sorter.columnKey as 'status' | 'date';

        // 如果点击的是当前排序列
        if (sortParams.value.field === field) {
            // 根据 sorter.order 切换方向
            if (sorter.order === 'ascend') {
                sortParams.value.order = 'asc';
            } else if (sorter.order === 'descend') {
                sortParams.value.order = 'desc';
            } else {
                // 如果 order 是 false，表示取消排序，保持当前状态或设为默认
                // 通常第一次点击是 descend
                sortParams.value.order = 'desc';
            }
        } else {
            // 新列，默认降序
            sortParams.value.field = field;
            sortParams.value.order = 'desc';
        }

        console.log('Updated sort params:', sortParams.value);

        pagination.value.page = 1;
        await expressions();
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

        // 构建排序参数 - 映射字段名
        const sort: any = {};
        const fieldMapping: Record<string, string> = {
            'status': 'status',
            'date': 'date'
        };

        if (sortParams.value.field) {
            const mappedField = fieldMapping[sortParams.value.field] || sortParams.value.field;
            sort[mappedField] = sortParams.value.order;
        }

        console.log('Fetching with params:', {
            sort,
            search,
            page: currentPage,
            pageSize: pagination.value.pageSize
        });

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
                statusIndex: entry.status, // 添加状态索引用于颜色映射
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

const collumns = computed<DataTableColumns<Row>>(() => [
    // {
    //     type: "selection",
    // },
    {
        type: "expand",
        expandable: (row: Row) => row.noteNum + row.senNum > 0,
        width: 60,
        renderExpand: (row: Row) => {
            return h(WordMore, {
                word: row.expr,
                key: `word-more-${row.expr}`
            });
        },
    },
    // 表达
    {
        title: "Expr",
        key: "expr",
        width: 150,
        ellipsis: {
            tooltip: true
        },
    },
    // 含义
    {
        title: "Meaning",
        key: "meaning",
        align: "left",
        width: 200,
        ellipsis: {
            tooltip: true
        },
    },
    // 标签
    {
        title: "Tags",
        key: "tags",
        width: 150,
        ellipsis: {
            tooltip: true
        },
        render(row) {
            return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                row.tags.slice(0, 3).map((tag: string) =>
                    h(
                        NTag,
                        {
                            style: { marginRight: "0" },
                            type: "info",
                            size: "small",
                        },
                        { default: () => tag }
                    )
                ).concat(row.tags.length > 3 ? [
                    h(NTag, {
                        size: 'small',
                        type: 'default'
                    }, { default: () => `+${row.tags.length - 3}` })
                ] : [])
            );
        },
    },
    // 学习状态
    {
        title: "Status",
        key: "status",
        align: "center",
        width: 120,
        filter: true,  // 启用筛选
        filterOptions: statusMap.map((status, index) => ({
            label: status,
            value: index
        })),
        filterMode: 'or',  // 多选时使用 OR 逻辑
        sorter: 'default' as const,  // ✅ 使用默认排序
        sortOrder: sortParams.value.field === 'status'
            ? (sortParams.value.order === 'asc' ? 'ascend' : 'descend')
            : false,
        render(row) {
            // 使用 statusIndex 直接映射颜色
            const color = statusColorMap[row.statusIndex] || '#999';
            return h(
                NTag,
                {
                    size: 'small',
                    style: {
                        backgroundColor: color + '20',
                        color: color,
                        border: `1px solid ${color}40`
                    }
                },
                { default: () => row.status }
            );
        }
    },
    // 修改日期
    {
        title: "Date",
        key: "date",
        width: 110,
        align: "center",
        sorter: 'default' as const,  // ✅ 使用默认排序
        sortOrder: sortParams.value.field === 'date'
            ? (sortParams.value.order === 'asc' ? 'ascend' : 'descend')
            : false,
    },
    // 操作
    {
        title: "Action",
        key: "action",
        width: 80,
        align: "center",
        render(row) {
            return h(
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
            );
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
        width: 24px;
    }

    .n-data-table-th--filterable {
        width: 24px;
    }

    // 排序图标样式
    .n-data-table-th__sorter {
        font-size: 14px;
        font-weight: bold;
    }

    // 表格行间距
    .n-data-table-td {
        padding: 8px 12px;
    }

    // 表格内容不换行
    .n-data-table-td {
        white-space: nowrap;
    }

    // 表头固定样式
    .n-data-table-th {
        white-space: nowrap;
        font-weight: 600;
    }

    // 确保表格宽度自适应
    .n-data-table {
        width: 100%;
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
