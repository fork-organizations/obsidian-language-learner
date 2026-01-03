<template>
    <div id="langr-data">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig.value">
            <!-- 操作按钮 -->
            <ActionButtons
                :has-active-filters="hasActiveFilters"
                @add-word="onAddWord"
                @refresh="expressions"
                @reset-filters="resetFilters"
                @export="handleExport"
            />

            <!-- 搜索和筛选面板 -->
            <div class="search-section">
                <SearchFilterPanel
                    v-model="searchParams"
                    :status-options="statusOptions"
                    :type-options="typeOptions"
                    @search="onSearchChange"
                />
            </div>

            <!-- 标签筛选 -->
            <div class="tag-section">
                <TagFilter
                    v-model:checked-tags="checkedTags"
                    v-model:mode="mode"
                    :tags="tags"
                />
            </div>

            <!-- 加载状态 -->
            <NSpin :show="loading" class="spin-container">
                <!-- 错误状态 -->
                <div v-if="!loading && error" class="empty-state-container">
                    <NEmpty
                        :description="error"
                        size="large"
                    >
                        <template #icon>
                            <span style="font-size: 3em">❌</span>
                        </template>
                        <template #extra>
                            <NSpace>
                                <NButton type="primary" @click="retryLoad">
                                    {{ t("Retry") }}
                                </NButton>
                                <NButton @click="resetFilters">
                                    {{ t("Reset Filters") }}
                                </NButton>
                            </NSpace>
                        </template>
                    </NEmpty>
                </div>

                <!-- 空状态 -->
                <div v-else-if="!loading && filteredData.length === 0" class="empty-state-container">
                    <NEmpty
                        :description="data.length === 0 ? t('No words found. Try adjusting your filters.') : t('No words match the selected tags.')"
                        size="large"
                    >
                        <template #icon>
                            <span style="font-size: 3em">📚</span>
                        </template>
                        <template #extra>
                            <NButton @click="resetFilters" v-if="hasActiveFilters">
                                {{ t("Reset Filters") }}
                            </NButton>
                        </template>
                    </NEmpty>
                </div>

                <!-- 卡片列表视图 -->
                <div v-else class="card-list-section">
                    <!-- 筛选结果提示 -->
                    <div v-if="filteredData.length !== data.length" class="filter-info">
                        <NText>
                            {{ t("Showing {0} of {1} words", filteredData.length, data.length) }}
                        </NText>
                    </div>

                    <WordCardList
                        :data="paginatedData"
                        @edit="handleEditWord"
                    />

                    <!-- 分页 -->
                    <div class="pagination-section">
                        <NPagination
                            v-model:page="pagination.page"
                            :page-size="pagination.pageSize"
                            :item-count="filteredData.length"
                            show-size-picker
                            :page-sizes="[15, 20, 30, 50]"
                            @update:page="handlePageChange"
                            @update:page-size="handlePageSizeChange"
                        />
                    </div>
                </div>
            </NSpin>
        </NConfigProvider>

        <LearnPanelModal @onChangeWord="onChangeWord" @on-change-show="onChangeShow" :show="showWordModal" :word="word"/>
    </div>
</template>

<script setup lang="ts">
import {moment, Notice} from "obsidian";
import {
    ref,
    computed,
    watch,
    getCurrentInstance,
    onMounted,
} from "vue";
import {
    NConfigProvider,
    NButton,
    NPagination,
    NSpin,
    NEmpty,
    NText,
    NSpace,
    GlobalThemeOverrides,
    darkTheme,
} from "naive-ui";
import {t} from "@/lang/helper";

import type PluginType from "@/plugin";
import LearnPanelModal from "@/views/LearnPanelModal.vue";
import { StatusColorMap } from "@/statusColors";

// 导入拆分的子组件
import ActionButtons from "@/component/DataPanel/ActionButtons.vue";
import SearchFilterPanel from "@/component/DataPanel/SearchFilterPanel.vue";
import TagFilter from "@/component/DataPanel/TagFilter.vue";
import WordCardList from "@/component/DataPanel/WordCardList.vue";

const plugin = getCurrentInstance().appContext.config.globalProperties
    .plugin as PluginType;

const themeConfig = computed<GlobalThemeOverrides>(() => ({
    // 统一字体大小
    common: {
        fontSize: '14px',
    },
}));

const loading = ref(true);
const error = ref<string | null>(null);
const retryCount = ref(0);

// 用户偏好设置的键名
const PREFS_KEY = 'datapanel-prefs';

// 保存用户偏好
const savePrefs = () => {
    const prefs = {
        pagination: {
            pageSize: pagination.value.pageSize,
            page: pagination.value.page
        },
        sort: {
            field: sortParams.value.field,
            order: sortParams.value.order
        },
        search: {
            expression: searchParams.value.expression,
            meaning: searchParams.value.meaning,
            status: searchParams.value.status,
            t: searchParams.value.t
        }
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

// 加载用户偏好
const loadPrefs = () => {
    try {
        const saved = localStorage.getItem(PREFS_KEY);
        if (saved) {
            const prefs = JSON.parse(saved);
            if (prefs.pagination?.pageSize) {
                pagination.value.pageSize = prefs.pagination.pageSize;
            }
            if (prefs.pagination?.page) {
                pagination.value.page = prefs.pagination.page;
            }
            if (prefs.sort?.field && prefs.sort?.order) {
                sortParams.value.field = prefs.sort.field;
                sortParams.value.order = prefs.sort.order;
            }
            if (prefs.search) {
                searchParams.value = {
                    expression: prefs.search.expression || '',
                    meaning: prefs.search.meaning || '',
                    status: prefs.search.status,
                    t: prefs.search.t
                };
            }
        }
    } catch (error) {
        console.error('Failed to load preferences:', error);
    }
};

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

// 卡片编辑处理
const handleEditWord = async (item: Row) => {
    word.value = await plugin.storage.DB()?.getExpression(item.expr);
    showWordModal.value = true;
};

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

// 检查是否有激活的筛选条件（优化：移除不必要的 !! 转换）
const hasActiveFilters = computed(() => {
    return Boolean(
        searchParams.value.expression ||
        searchParams.value.meaning ||
        searchParams.value.status !== undefined ||
        searchParams.value.t
    );
});

// 搜索变化处理（防抖已在 SearchFilterPanel 中处理）
const onSearchChange = () => {
    pagination.value.page = 1; // 重置到第一页
    savePrefs(); // 保存偏好
    expressions();
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

    savePrefs(); // 保存偏好

    // 强制重新加载数据
    await expressions();
};

function handlePageChange(currentPage: number) {
    console.log('[DataPanel] Page changed to:', currentPage);
    pagination.value.page = currentPage;
}

function handlePageSizeChange(pageSize: number) {
    console.log('[DataPanel] Page size changed to:', pageSize);
    pagination.value.pageSize = pageSize;
    pagination.value.page = 1; // 重置到第一页
    savePrefs(); // 保存偏好
}

const expressions = async () => {
    loading.value = true;
    error.value = null;

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

        let response = await plugin.storage.DB().getAllExpressionSimple(
            true,  // ignores
            sort,   // sort
            Object.keys(search).length > 0 ? search : undefined,  // search
            undefined  // 不传 paginate，获取所有数据
        );

        // 显示所有数据（客户端分页）
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

        // 只在第一次加载时获取标签
        if (tags.value.length === 0) {
            tags.value = await plugin.storage.DB().getTags();
            checkedTags.value = Array(tags.value.length).map((_) => false);
        }
    } catch (err) {
        console.error("Failed to load expressions:", err);
        error.value = t("Failed to load data. Please try again.");
        data.value = [];
        new Notice(t("Failed to load data"));
    } finally {
        loading.value = false;
    }
}

// 重试加载数据
const retryLoad = () => {
    retryCount.value++;
    expressions();
};

// 导出数据
const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = filteredData.value;

    if (format === 'csv') {
        exportToCSV(dataToExport);
    } else if (format === 'json') {
        exportToJSON(dataToExport);
    }
};

// 导出为 CSV
const exportToCSV = (data: Row[]) => {
    if (data.length === 0) {
        new Notice(t("No data to export"));
        return;
    }

    // CSV 头部
    const headers = ['Expression', 'Meaning', 'Tags', 'Status', 'Date', 'Notes Count', 'Sentences Count'];

    // CSV 数据
    const csvData = data.map(row => [
        `"${row.expr}"`,
        `"${(row.meaning || '').replace(/"/g, '""')}"`,
        `"${row.tags.join(', ')}"`,
        `"${row.status}"`,
        `"${row.date}"`,
        row.noteNum,
        row.senNum
    ]);

    // 组合 CSV
    const csv = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
    ].join('\n');

    // 创建 Blob 并下载
    downloadFile(csv, 'word-data.csv', 'text/csv;charset=utf-8;');
    new Notice(`${t("Words exported successfully")}: ${data.length} ${t("words").toLowerCase()}`);
};

// 导出为 JSON
const exportToJSON = (data: Row[]) => {
    if (data.length === 0) {
        new Notice(t("No data to export"));
        return;
    }

    const jsonData = data.map(row => ({
        expression: row.expr,
        meaning: row.meaning,
        tags: row.tags,
        status: row.status,
        statusIndex: row.statusIndex,
        date: row.date,
        notesCount: row.noteNum,
        sentencesCount: row.senNum
    }));

    const json = JSON.stringify(jsonData, null, 2);
    downloadFile(json, 'word-data.json', 'application/json;charset=utf-8;');
    new Notice(`${t("Words exported successfully")}: ${data.length} ${t("words").toLowerCase()}`);
};

// 下载文件辅助函数
const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

onMounted(() => {
    loadPrefs(); // 加载用户偏好
    expressions();
});

let data = ref<Row[]>([]);

let mode = ref("and");
let tags = ref<string[]>([]);
let checkedTags = ref<boolean[]>([]);

// 根据标签筛选数据（优化：缓存选中的标签数组）
const selectedTags = computed(() => {
    return tags.value.filter((tag, i) => checkedTags.value[i]);
});

// 根据标签筛选数据
const filteredData = computed(() => {
    const currentSelectedTags = selectedTags.value;

    // 如果没有选中标签，返回所有数据（快速路径）
    if (currentSelectedTags.length === 0) {
        return data.value;
    }

    const isAndMode = mode.value === "and";

    // 根据模式筛选
    return data.value.filter((item) => {
        const itemTags = item.tags;

        if (isAndMode) {
            // AND 模式：必须包含所有选中的标签
            return currentSelectedTags.every(tag => itemTags.includes(tag));
        } else {
            // OR 模式：包含任一选中的标签即可
            return currentSelectedTags.some(tag => itemTags.includes(tag));
        }
    });
});

// 监听标签变化，更新分页信息（优化：使用 selectedTags computed）
watch([selectedTags, mode], () => {
    console.log('Tags filter changed:', selectedTags.value, 'Mode:', mode.value);
    // 标签筛选改变时重置到第一页
    pagination.value.page = 1;
}, { deep: true });

// 客户端分页：从筛选结果中获取当前页的数据
const paginatedData = computed(() => {
    const start = (pagination.value.page - 1) * pagination.value.pageSize;
    const end = start + pagination.value.pageSize;
    return filteredData.value.slice(start, end);
});
</script>

<style lang="scss">
#langr-data {
    padding: 10px;

    .search-section,
    .tag-section {
        margin-bottom: 16px;
    }

    .spin-container {
        min-height: 400px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .empty-state-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 60px 20px;
        min-height: 300px;
    }

    .card-list-section {
        margin-top: 16px;

        .filter-info {
            padding: 8px 12px;
            background: var(--n-color-modal);
            border-radius: 4px;
            margin-bottom: 12px;
            text-align: center;
            font-size: 0.9em;
            color: var(--n-text-color-2);
        }
    }

    .pagination-section {
        margin-top: 20px;
        display: flex;
        justify-content: center;
        padding: 16px 0;
    }
}
</style>
