<template>
    <div class="word-card-list">
        <!-- 使用 CSS Grid 实现响应式布局 -->
        <TransitionGroup name="list" tag="div" class="card-grid">
            <div
                v-for="item in data"
                :key="item.expr"
                class="word-card"
            >
                <!-- 单词和状态 -->
                <div class="card-header">
                    <div class="word-info">
                        <span class="word-text">{{ item.expr }}</span>
                        <NTag
                            size="small"
                            :style="getStatusStyle(item.statusIndex)"
                        >
                            {{ item.status }}
                        </NTag>
                    </div>
                    <NSpace :size="8">
                        <NButton
                            size="small"
                            type="info"
                            secondary
                            @click="handleEdit(item)"
                        >
                            {{ t("Edit") }}
                        </NButton>
                        <NButton
                            v-if="item.noteNum + item.senNum > 0"
                            size="small"
                            type="default"
                            @click="handleViewDetails(item)"
                        >
                            {{ t("View Details") }}
                        </NButton>
                    </NSpace>
                </div>

                <!-- 含义 -->
                <div v-if="item.meaning" class="card-meaning">
                    <span class="label">{{ t("Meaning") }}:</span>
                    <span class="content">{{ item.meaning }}</span>
                </div>

                <!-- 标签 -->
                <div v-if="item.tags && item.tags.length > 0" class="card-tags">
                    <span class="label">{{ t("Tags") }}:</span>
                    <NSpace :size="6" :wrap="true">
                        <NTag
                            v-for="(tag, i) in item.tags.slice(0, 3)"
                            :key="i"
                            size="small"
                            type="info"
                        >
                            #{{ tag }}
                        </NTag>
                        <span v-if="item.tags.length > 3" class="more-tags">
                            +{{ item.tags.length - 3 }}
                        </span>
                    </NSpace>
                </div>

                <!-- 统计信息 -->
                <div class="card-stats">
                    <div v-if="item.noteNum > 0" class="stat-item">
                        <span class="stat-icon">📝</span>
                        <span class="stat-value">{{ item.noteNum }}</span>
                    </div>
                    <div v-if="item.senNum > 0" class="stat-item">
                        <span class="stat-icon">💬</span>
                        <span class="stat-value">{{ item.senNum }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">📅</span>
                        <span class="stat-value">{{ item.date }}</span>
                    </div>
                </div>
            </div>
        </TransitionGroup>

        <!-- 展开详情模态框 -->
        <WordMoreModal
            v-if="showModal"
            :word="currentWord?.expr"
            :show="showModal"
            @update:show="showModal = false"
        />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NTag, NButton, NSpace } from 'naive-ui';
import { t } from '@/lang/helper';
import { StatusColorMap } from '@/statusColors';
import WordMoreModal from '@/component/WordMoreModal.vue';

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

const props = defineProps<{
    data: Row[];
}>();

const emit = defineEmits<{
    (e: 'edit', item: Row): void;
}>();

const showModal = ref(false);
const currentWord = ref<Row | null>(null);

// 缓存状态颜色映射，避免重复计算
const statusStyleCache = new Map<number, ReturnType<typeof getStatusStyle>>();

const handleEdit = (item: Row) => {
    emit('edit', item);
};

const handleViewDetails = (item: Row) => {
    currentWord.value = item;
    showModal.value = true;
};

const getStatusStyle = (statusIndex: number) => {
    // 检查缓存
    if (statusStyleCache.has(statusIndex)) {
        return statusStyleCache.get(statusIndex)!;
    }

    // 计算并缓存
    const colorConfig = StatusColorMap[statusIndex];
    const color = colorConfig?.main || '#999';
    const bgColor = colorConfig?.bg || `${color}20`;
    const borderColor = colorConfig?.border || `${color}40`;

    const style = {
        backgroundColor: bgColor,
        color: color,
        border: `1px solid ${borderColor}`
    };

    statusStyleCache.set(statusIndex, style);
    return style;
};
</script>

<style lang="scss" scoped>
.word-card-list {
    padding: 10px 0;

    .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        width: 100%;
        position: relative;
    }

    .word-card {
        background: var(--n-card-color);
        border: 1px solid var(--n-border-color);
        border-radius: 8px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        position: relative;
        overflow: hidden;
        min-height: 180px; // 固定最小高度，避免分页时抖动

        // 添加微妙的进入动画
        animation: card-enter 0.3s ease-out;

        // 增强的 hover 效果
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

        &:hover {
            border-color: var(--n-primary-color);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateY(-2px);

            .word-text {
                color: var(--n-primary-color);
            }
        }

        // 点击反馈
        &:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;

            .word-info {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
                flex-wrap: wrap;

                .word-text {
                    font-size: 18px;
                    font-weight: bold;
                    color: var(--n-text-color);
                    transition: color 0.2s;
                }
            }
        }

        .card-meaning {
            padding: 10px;
            background: var(--n-modal-color);
            border-radius: 4px;
            border-left: 3px solid var(--n-primary-color);
            transition: all 0.2s;
            flex-shrink: 0; // 防止被压缩

            &:hover {
                background: var(--n-color-target);
            }

            .label {
                font-weight: 600;
                margin-right: 8px;
                color: var(--n-text-color-2);
                font-size: 0.95em;
            }

            .content {
                color: var(--n-text-color);
                line-height: 1.5;
                word-break: break-word; // 长文本自动换行
            }
        }

        .card-tags {
            .label {
                font-weight: 600;
                margin-right: 8px;
                color: var(--n-text-color-2);
            }

            .more-tags {
                color: var(--n-text-color-3);
                font-size: 0.9em;
            }
        }

        .card-stats {
            display: flex;
            gap: 16px;
            padding-top: 10px;
            border-top: 1px solid var(--n-divider-color);
            flex-wrap: wrap;

            .stat-item {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 0.9em;
                color: var(--n-text-color-2);
                transition: all 0.2s;

                &:hover {
                    color: var(--n-primary-color);

                    .stat-icon {
                        transform: scale(1.1);
                    }
                }

                .stat-icon {
                    font-size: 1.1em;
                    transition: transform 0.2s;
                }

                .stat-value {
                    color: var(--n-text-color);
                    font-weight: 500;
                }
            }
        }
    }
}

// 列表过渡动画 (TransitionGroup)
.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}

.list-enter-from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
}

.list-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.list-move {
    transition: transform 0.3s ease;
}

/* 确保离开的元素脱离文档流，实现平滑的布局动画 */
.list-leave-active {
    position: absolute;
    width: 100%;
    z-index: 0;
}

// 卡片进入动画
@keyframes card-enter {
    0% {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
</style>
