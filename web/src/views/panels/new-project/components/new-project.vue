<!--
  Copyright (c) 2025 Huawei Technologies Co., Ltd.
  This program is free software, you can redistribute it and/or modify it under the terms and conditions of
  CANN Open Software License Agreement Version 2.0 (the "License").
  Please refer to the License for details. You may not use this file except in compliance with the License.
  THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
  INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
  See LICENSE in the root of the software repository for the full text of the License.
-->
<script setup lang="ts">
import {
  ref, onMounted, computed,
} from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { t } from 'i18next';
import {
  OperatorProjectViewId,
  isOperatorProjectViewId,
  isStandardCustomProjectType,
  type OperatorProjectViewIdValue,
} from '@shared/project-type-view-id';
import {
  useNewProject,
  ensureExperimentalInPath,
} from '../composables/use-new-project';
import { FormRulesFactory } from '../composables/form-rules';
import TemplatePreview from '@/components/template-previews/template-preview.vue';
import { getProjectPreviewFiles } from '@/components/template-previews/template-preview-files';
import {
  getProjectType, getProjectTypeSupportEnabled,
} from '@web/apis';

const getTextColorClass = () => 'op-text';
const getConfigDividerClass = () => 'border-[var(--op-devtools-border)]';

defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add'>('helloworld');

const {
  setConnectionFormRef,
  selectedId_type,
  projectFormData,
  projectPathOptions,
  projectPathLoading,
  projectSHOptions,
  projectSHLoading,
  remoteSearch,
  handleSelectFolder,
  handleSelectFile,
  handleCreatedProject,
} = useNewProject(selectedTemplate);

const tryAppendExperimentalToPath = () => {
  if (!projectFormData.projectPath) {
    return;
  }

  // 仅标准自定义算子工程的子算子路径需要 experimental 后缀；
  // 切换到其它类型时去除尾部 experimental 后缀，避免污染新工程路径。
  if (selectedId_type.value === OperatorProjectViewId.STANDARD_CUSTOM) {
    const updated = ensureExperimentalInPath(projectFormData.projectPath);

    if (updated !== projectFormData.projectPath) {
      projectFormData.projectPath = updated;
    }
  }
  else {
    const stripped = projectFormData.projectPath.replace(/[/\\]experimental$/i, '');

    if (stripped !== projectFormData.projectPath) {
      projectFormData.projectPath = stripped;
    }
  }
};

const projectTypeTabKey = computed<string>({
  get: () => String(selectedId_type.value),
  set: (key: string) => {
    const id = Number(key);

    if (isOperatorProjectViewId(id)) {
      selectedId_type.value = id;
      tryAppendExperimentalToPath();
    }
  },
});

const getTemplateDesc = (template: string) => {
  switch (template) {
    case 'helloworld':
      return t('web.welcome.templateDescHelloworld');
    case 'addn':
      return t('web.welcome.templateDescAddn');
    case 'torch_library_template':
      return t('web.welcome.templateDescTorchLibrary');
    case 'triton_vector_add':
      return t('web.welcome.templateDescTritonVectorAdd');
    default:
      return t('web.welcome.templateDescHelloworld');
  }
};

const getProjectPreviewFilesForItem = (projectTypeId: OperatorProjectViewIdValue) => {
  return getProjectPreviewFiles(
    projectTypeId,
    projectTypeId === OperatorProjectViewId.CANN ? selectedTemplate.value : undefined,
  );
};

type ProjectTypeItem = {
  id: OperatorProjectViewIdValue;
  titleKey:
    | 'web.welcome.ascendCOpProject'
    | 'web.welcome.ascendCStandardProject'
    | 'web.welcome.pythonPyascProject'
    | 'web.welcome.pythonTritonProject';
  descKey:
    | 'web.link.ascendCOpDesc'
    | 'web.link.ascendCStandardDesc'
    | 'web.link.pythonPyascDesc'
    | 'web.link.pythonTritonDesc';
};

const cannProject: ProjectTypeItem = {
  id: OperatorProjectViewId.CANN,
  titleKey: 'web.welcome.ascendCOpProject' as const,
  descKey: 'web.link.ascendCOpDesc' as const,
};
const ascendProject: ProjectTypeItem = {
  id: OperatorProjectViewId.STANDARD_CUSTOM,
  titleKey: 'web.welcome.ascendCStandardProject' as const,
  descKey: 'web.link.ascendCStandardDesc' as const,
};
const pyascProject: ProjectTypeItem = {
  id: OperatorProjectViewId.PYASC,
  titleKey: 'web.welcome.pythonPyascProject' as const,
  descKey: 'web.link.pythonPyascDesc' as const,
};
const tritonProject: ProjectTypeItem = {
  id: OperatorProjectViewId.TRITON,
  titleKey: 'web.welcome.pythonTritonProject' as const,
  descKey: 'web.link.pythonTritonDesc' as const,
};
const items_type = ref<ProjectTypeItem[]>([
  cannProject,
  ascendProject,
  pyascProject,
  tritonProject,
]);

const projectPreviewFilesMap = computed(() => {
  const previewFilesMap = new Map<OperatorProjectViewIdValue, ReturnType<typeof getProjectPreviewFiles>>();

  items_type.value.forEach((item) => {
    previewFilesMap.set(item.id, getProjectPreviewFilesForItem(item.id));
  });

  return previewFilesMap;
});

const connectionFormRules = FormRulesFactory.createFormRules();

const currentProjectType = ref('');

onMounted(async () => {
  try {
    const tritonEnabled = await getProjectTypeSupportEnabled(OperatorProjectViewId.TRITON);

    if (!tritonEnabled) {
      items_type.value = items_type.value.filter((item) => item.id !== OperatorProjectViewId.TRITON);

      if (selectedId_type.value === OperatorProjectViewId.TRITON) {
        selectedId_type.value = OperatorProjectViewId.CANN;
      }
    }
  }
  catch (error) {
    console.error('[Link] Failed to read project type support setting:', error);
  }

  try {
    const result = await getProjectType();

    currentProjectType.value = result.projectType || '';
    console.log('[Operate] 当前项目类型:', currentProjectType.value);

    if (isStandardCustomProjectType(currentProjectType.value)) {
      // 不裁剪可选项：在标准自定义算子工程中也允许创建其它类型算子（issue #83）。
      // 仅默认选中 STANDARD_CUSTOM，以便走子算子流程（不打开新工程）。
      selectedId_type.value = OperatorProjectViewId.STANDARD_CUSTOM;
      tryAppendExperimentalToPath();
    }
  }
  catch (error) {
    console.error('[Operate] 获取项目类型失败:', error);
    currentProjectType.value = '';
  }
});
</script>
<template>
  <div class="w-full">
    <div class="welcome-step-media-tabs welcome-new-project-tabs box-border w-full min-h-0 min-w-0">
      <a-tabs
        v-model:active-key="projectTypeTabKey"
        class="w-full"
        tab-position="left"
      >
        <a-tab-pane
          v-for="item in items_type"
          :key="String(item.id)"
          :tab="t(item.titleKey)"
        >
          <div
            class="welcome-new-project-tab-desc mb-2.5 whitespace-normal"
            v-html="item.id === OperatorProjectViewId.CANN ? getTemplateDesc(selectedTemplate) : t(item.descKey)"
          />
          <a-tag
            v-if="item.id === OperatorProjectViewId.CANN || item.id === OperatorProjectViewId.STANDARD_CUSTOM"
            color="blue"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.langAscendC') }}
          </a-tag>
          <a-tag
            v-if="item.id === OperatorProjectViewId.PYASC || item.id === OperatorProjectViewId.TRITON"
            color="blue"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.langPython') }}
          </a-tag>
          <a-tag
            v-if="item.id === OperatorProjectViewId.CANN"
            color="purple"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.typeAngle') }}
          </a-tag>
          <a-tag
            v-if="item.id === OperatorProjectViewId.STANDARD_CUSTOM"
            color="green"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.typeStandardCustom') }}
          </a-tag>
          <a-tag
            v-if="item.id === OperatorProjectViewId.PYASC"
            color="purple"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.typePyasc') }}
          </a-tag>
          <a-tag
            v-if="item.id === OperatorProjectViewId.TRITON"
            color="purple"
            class="mt-2 mr-2"
          >
            {{ t('web.welcome.typeTriton') }}
          </a-tag>
          <div
            v-if="item.id === OperatorProjectViewId.CANN"
            class="mt-4"
          >
            <a-radio-group
              v-model:value="selectedTemplate"
              class="sample-radio-group flex flex-wrap gap-4"
            >
              <a-radio value="helloworld">
                helloworld
              </a-radio>
              <a-radio value="addn">
                addn
              </a-radio>
              <a-radio value="torch_library_template">
                torch_library
              </a-radio>
            </a-radio-group>
          </div>
          <div class="mt-4">
            <div class="transition-all duration-300">
              <TemplatePreview
                v-if="projectPreviewFilesMap.get(item.id)"
                :files="projectPreviewFilesMap.get(item.id)!"
                class="welcome-new-project-preview block transition-opacity duration-300 transform"
              />
            </div>
          </div>
          <div
            v-if="selectedId_type === item.id"
            class="new-project-config mt-6 pt-6 border-t text-left text-sm font-normal leading-[22px]"
            :class="[getTextColorClass(), getConfigDividerClass()]"
          >
            <a-form
              :ref="setConnectionFormRef"
              :model="projectFormData"
              :rules="connectionFormRules as any"
              layout="vertical"
              class="new-project-form"
            >
              <a-form-item name="projectName">
                <template #label>
                  <span>{{ t('web.link.projectNameLabel') }}</span>
                  <a-tooltip :title="t('web.link.projectNameTooltip')">
                    <QuestionCircleOutlined class="help-icon" />
                  </a-tooltip>
                </template>
                <a-input
                  v-model:value="projectFormData.projectName"
                  :placeholder="t('web.link.projectNamePlaceholder')"
                />
              </a-form-item>
              <a-form-item name="projectPath">
                <template #label>
                  <span>{{ t('web.link.projectPathLabel') }}</span>
                  <a-tooltip :title="t('web.link.projectPathTooltip')">
                    <QuestionCircleOutlined class="help-icon" />
                  </a-tooltip>
                </template>
                <a-auto-complete
                  v-model:value="projectFormData.projectPath"
                  :options="projectPathOptions"
                  :loading="projectPathLoading"
                  :placeholder="t('web.link.projectPathPlaceholder')"
                  @search="(val) => remoteSearch('projectPath', val)"
                  @focus="handleSelectFolder"
                />
              </a-form-item>
              <a-form-item name="projectSH">
                <template #label>
                  <span>{{ t('web.link.envScriptLabel') }}</span>
                  <a-tooltip :title="t('web.link.envScriptTooltip')">
                    <QuestionCircleOutlined class="help-icon" />
                  </a-tooltip>
                </template>
                <a-auto-complete
                  v-model:value="projectFormData.projectSH"
                  :options="projectSHOptions"
                  :loading="projectSHLoading"
                  :placeholder="t('web.link.envScriptPlaceholder')"
                  @search="(val) => remoteSearch('projectSH', val)"
                  @focus="handleSelectFile"
                />
              </a-form-item>
            </a-form>
            <a-button
              type="primary"
              class="new-project-create-btn"
              @click="handleCreatedProject"
            >
              {{ t('web.link.createNow') }}
            </a-button>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>
<style scoped lang="less">
::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

::-webkit-scrollbar-track {
  background: var(--op-devtools-background);
  /* 轨道背景色 */
  border-radius: 6px;
}

::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background, var(--op-devtools-border));
  /* 滑块颜色 */
  border-radius: 6px;
  /* 滑块圆角 */
  border: 2px solid var(--op-devtools-background);
  /* 滑块边框，与轨道背景色相同形成间隔效果 */
}

::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground, var(--op-devtools-border));
  /* 悬停时颜色变深 */
}

::-webkit-scrollbar-thumb:active {
  background: var(--vscode-scrollbarSlider-activeBackground, var(--op-devtools-focus-border));
  /* 点击时颜色更深 */
}

::-webkit-scrollbar-corner {
  background: var(--op-devtools-background);
}

:deep(.sample-radio-group .ant-radio-wrapper) {
  color: var(--vscode-editor-foreground);
}

.welcome-step-media-tabs {
  width: 100%;
  min-width: 0;
}

.welcome-new-project-tabs :deep(.ant-tabs-left) {
  display: flex;
  align-items: stretch;
  min-height: 0;
  flex: 1;
}

.welcome-new-project-tabs :deep(.ant-tabs-left > .ant-tabs-nav) {
  flex: 0 0 auto;
  align-self: flex-start;
  width: auto;
  min-width: 10.5rem;
  max-width: min(22rem, 46%);
  height: auto;
  max-height: none;
  margin: 0 16px 0 0;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-nav-wrap) {
  flex: none !important;
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-nav-wrap::before),
.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-nav-wrap::after) {
  display: none !important;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-nav-list) {
  flex-direction: column;
  width: 100%;
  align-items: stretch;
  transform: none !important;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-nav-operations) {
  display: none !important;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-tab) {
  flex: 0 0 auto !important;
  width: 100%;
  justify-content: flex-start;
  margin: 0 0 2px 0 !important;
  padding: 8px 10px;
  min-width: 0;
  overflow: visible;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-tab-btn) {
  max-width: none;
  width: 100%;
  overflow: visible;
  text-overflow: unset;
  white-space: normal;
  text-align: left;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.625;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-content-holder) {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding-left: 12px;
}

.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-tabpane) {
  padding: 8px 0 0 16px;
}

.welcome-new-project-tab-desc {
  font-size: 15px;
  line-height: 1.625;
  color: var(--vscode-descriptionForeground);
}

.welcome-new-project-tabs :deep(.sample-radio-group .ant-radio-wrapper) {
  font-size: 15px;
  line-height: 1.625;
}

.welcome-new-project-tabs :deep(.ant-tag) {
  font-size: 15px;
  line-height: 1.625;
}

@media (max-width: 576px) {
  .welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-tab-btn) {
    font-size: 14px;
  }

  .welcome-new-project-tab-desc {
    font-size: 14px;
  }

  .welcome-new-project-tabs :deep(.sample-radio-group .ant-radio-wrapper) {
    font-size: 14px;
  }

  .welcome-new-project-tabs :deep(.ant-tag) {
    font-size: 14px;
  }
}

.new-project-create-btn {
  width: auto;
  min-width: 84px;
  height: auto;
  margin: 0;
  padding: 8px 8px !important;
  border-radius: 0;
  line-height: 1;
}

.new-project-config :deep(.new-project-form .ant-form-item-label) {
  width: 100%;
  max-width: none;
  flex: 0 0 100%;
  text-align: left;
}

.new-project-config :deep(.new-project-form .ant-form-item-label > label) {
  width: 100%;
}

.new-project-config :deep(.new-project-form .ant-form-item-control) {
  width: 100%;
  max-width: none;
  flex: 1 1 100%;
}

.new-project-config :deep(.ant-form-item-label .help-icon) {
  color: var(--op-devtools-muted-foreground);
  cursor: help;
  font-size: 14px;
  margin-left: 4px;
}
</style>
