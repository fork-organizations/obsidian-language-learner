<template>
  <div>
    <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
      <NModal
        :show="props.show"
        @update:show="handleShowChange"
        :mask-closable="false"
        preset="dialog"
        :title="t('Learning New Words')"
        class="learn-panel-modal"
      >
        <div id="langr-learn-panel-modal">
          <LearnPanelForm :model="model">
            <template #action>
              <div style="margin-top: 10px">
                <NButton
                  size="small"
                  style="--n-width: 100%"
                  attr-type="submit"
                  @click="submit"
                  :loading="submitLoading"
                  >{{ t("Submit") }}
                </NButton>
              </div>
            </template>
          </LearnPanelForm>
        </div>
      </NModal>
    </NConfigProvider>
  </div>
</template>

<script setup lang="ts">
import { darkTheme, NButton, NConfigProvider, NModal } from "naive-ui";
import { ExpressionInfo } from "@/storage/interface";
import { computed, PropType, watch, getCurrentInstance, ref } from "vue";
import { t } from "@/lang/helper";
import { Notice } from "obsidian";
import Plugin from "@/plugin";
import store from "@/store";
import { useLearn } from "./useLearn";
import LearnPanelForm from "./LearnPanelForm.vue";

const emit = defineEmits(["onChangeShow", "onChangeWord"]);

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  word: {
    type: Object as PropType<ExpressionInfo>,
    required: true,
  },
});

const { model, themeOverrides, plugin, submit: submitForm } = useLearn();

// 处理模态框显示状态变化
const handleShowChange = (value: boolean) => {
    emit("onChangeShow", value);
};

watch(
  () => props.show,
  (newValue) => {
    if (newValue === false) {
      emit("onChangeShow", newValue);
    }
  }
);
watch(
  () => props.word,
  (newValue) => {
    // 防止重复
    model.value = JSON.parse(JSON.stringify(newValue));
  }
);

// 切换明亮/黑暗模式
const theme = computed(() => {
  return store.dark ? darkTheme : null;
});

// 提交信息到数据库的加载状态
let submitLoading = ref(false);

async function submit() {
  submitLoading.value = true;
  const res = await submitForm(props.word.expression);
  submitLoading.value = false;

  if (res) {
    emit("onChangeShow", false);
    emit("onChangeWord", model);
  }
}
</script>

<style lang="scss">
.learn-panel-modal {
  width: 620px;
  max-width: 95vw;
  max-height: 800px;
  overflow: hidden; /* Main modal shouldn't scroll, content should */
  display: flex;
  flex-direction: column;

  .n-dialog__content {
    overflow-y: auto;
    padding-right: 10px; /* Avoid scrollbar overlapping content */
  }
}

#langr-learn-panel-modal {
  /* Styles handled by LearnPanelForm */
}
</style>
