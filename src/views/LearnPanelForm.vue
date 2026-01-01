<template>
    <div class="learn-panel-form">
        <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
            <NForm :model="model" label-placement="top" label-width="auto" :rules="rules"
                   require-mark-placement="right-hanging">
                <!-- Expression -->
                <NFormItem :label="t('Expression')" :label-style="labelStyle" path="expression">
                    <NInput size="small" v-model:value="model.expression" :placeholder="t('A word or a phrase')"/>
                </NFormItem>
                
                <!-- Meaning -->
                <NFormItem :label="t('Meaning')" :label-style="labelStyle" path="meaning">
                    <NInput size="small" v-model:value="model.meaning" :placeholder="t('A short definition')"
                            type="textarea" autosize/>
                </NFormItem>
                
                <!-- Type -->
                <NFormItem :label="t('Type')" :label-style="labelStyle" path="t">
                    <NRadioGroup v-model:value="model.t">
                        <NRadio value="WORD">{{ t("Word") }}</NRadio>
                        <NRadio value="PHRASE">{{ t("Phrase") }}</NRadio>
                    </NRadioGroup>
                </NFormItem>
                
                <!-- Status -->
                <NFormItem :label="t('Status')" :label-style="labelStyle" path="status">
                    <NRadioGroup v-model:value="model.status" size="small">
                        <NRadioButton v-for="(s, i) in statusOptions" :value="i" :key="i">
                            {{ s.text }}
                        </NRadioButton>
                    </NRadioGroup>
                </NFormItem>
                
                <!-- Tags -->
                <NFormItem :label="t('Tags')" :label-style="labelStyle" path="tags">
                    <NSelect size="small" v-model:value="model.tags" filterable multiple tag
                             :placeholder="t('Input or select some tags')" :loading="tagLoading"
                             :options="tagOptions"
                             @search="tagSearch"></NSelect>
                </NFormItem>
                
                <!-- Notes -->
                <NFormItem :label="t('Notes')" :label-style="labelStyle" path="notes">
                    <NDynamicInput v-model:value="model.notes" :create-button-props="{ size: 'small' }">
                        <template #create-button-default>
                            {{ t("Create") }}
                        </template>
                        <template v-slot="{ index }">
                            <NInput size="small" type="textarea" :placeholder="t('Write a new note')"
                                    v-model:value="model.notes[index]"/>
                        </template>
                    </NDynamicInput>
                </NFormItem>
                
                <!-- Sentences -->
                <div style="margin-bottom: 8px">
                    <label :style="labelStyle">{{ t("Sentences") }}</label>
                </div>
                <NDynamicInput v-model:value="model.sentences" :create-button-props="{ size: 'small' }"
                               :on-create="onCreateSentence">
                    <template #create-button-default>
                        {{ t("Create") }}
                    </template>
                    <template v-slot="{ index }">
                        <div class="sentence-item">
                            <NFormItem :show-label="false" :show-feedback="false" :path="`sentences[${index}].sentence`"
                                       :rule="sourceRule">
                                <NInput size="small" type="textarea" v-model:value="model.sentences[index].sentence"
                                        :placeholder="t('Origin sentence')"
                                        :autosize="{ minRows: 1, maxRows: 3 }"/>
                            </NFormItem>
                            <NFormItem :show-feedback="false" :show-label="false"
                                       :path="`sentences[${index}].trans`">
                                <NInput size="small" type="textarea"
                                        v-model:value="model.sentences[index].trans"
                                        :placeholder="t('Translation (Optional)')"
                                        :autosize="{ minRows: 1, maxRows: 3 }"/>
                            </NFormItem>
                            <NFormItem :show-feedback="false" :show-label="false"
                                       :path="`sentences[${index}].origin`">
                                <NInput size="small" type="textarea" v-model:value="model.sentences[index].origin" 
                                        :placeholder="t('Origin (Optional)')" :autosize="{ minRows: 1, maxRows: 3 }"/>
                            </NFormItem>
                        </div>
                    </template>
                </NDynamicInput>
            </NForm>
            
            <slot name="action"></slot>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { PropType, computed } from "vue";
import {
    NConfigProvider,
    NForm,
    NFormItem,
    NInput,
    NRadio,
    NRadioButton,
    NRadioGroup,
    NSelect,
    NDynamicInput,
    darkTheme
} from "naive-ui";
import { t } from "@/lang/helper";
import { useLearn } from "./useLearn";
import store from "@/store";
import { ExpressionInfo } from "@/storage/interface";

const props = defineProps({
    model: {
        type: Object as PropType<ExpressionInfo>,
        required: true
    }
});

const {
    rules,
    sourceRule,
    labelStyle,
    statusOptions,
    themeOverrides,
    onCreateSentence,
    tagOptions,
    tagLoading,
    tagSearch
} = useLearn();

// Theme logic
const theme = computed(() => {
    return store.dark ? darkTheme : null;
});
</script>

<style lang="scss">
.learn-panel-form {
    padding-bottom: 18px;

    .n-input {
        margin: 1px 0;
    }

    .sentence-item {
        display: flex;
        flex-direction: column;
        flex: 1;
        border: 2px solid var(--n-border-color); /* Use theme variable if possible, or fallback */
        border-color: rgba(128, 128, 128, 0.5);
        border-radius: 3px;
        padding: 3px;
    }

    .n-dynamic-input .n-button-group {
        flex-direction: column;

        button {
            height: 26px;
            width: 26px;

            &:nth-child(1) {
                border-top-left-radius: 34px !important;
                border-top-right-radius: 34px !important;
                border-bottom-left-radius: 0 !important;
                border-bottom-right-radius: 0 !important;
            }

            &:nth-child(2) {
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
                border-bottom-left-radius: 34px !important;
                border-bottom-right-radius: 34px !important;
            }
        }
    }
}
</style>
