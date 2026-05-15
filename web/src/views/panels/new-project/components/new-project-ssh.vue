<script setup lang="ts">
import {
  ref, onMounted,
} from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { t } from 'i18next';
import { OperatorProjectViewId, type OperatorProjectViewIdValue } from '@shared/project-type-view-id';
import { useNewProjectSSH } from '../composables/use-new-project-ssh';
import { FormRulesFactory } from '../composables/form-rules';
import tipBase_0 from '@/assets/imgs/add.png';
import standardCustomPreview from '@/assets/imgs/standard_custom.png';
import AscendC from '@/assets/imgs/AscendC.png';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import tritonVectorAddPreview from '@/assets/imgs/triton_vector_add.png';
import { getProjectType, getProjectTypeSupportEnabled } from '@web/apis';

const getTextColorClass = () => 'op-text';
const getBorderColorClass = () => 'border-[var(--op-devtools-border)]';
const getSelectedBorderClass = () =>
  'border-[var(--op-devtools-focus-border)] shadow-[0_0_0_3px_rgba(24,144,255,0.15)]';
const getDividerClass = () => 'bg-[var(--op-devtools-border)]';
const getDividerBorderClass = () => 'border-[var(--op-devtools-border)]';
const getDescTextClass = () => 'op-text-muted';

// 根据主题获取文本颜色
// 根据主题获取边框颜色
// 根据主题获取选中状态的边框和阴影
// 根据主题获取分割线颜色（背景色）
// 根据主题获取边框颜色（用于 border-t 等）
// 根据主题获取描述文本颜色

defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add'>('helloworld');

const {
  connectionFormRef,
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
} = useNewProjectSSH(selectedTemplate);

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

const getTemplateImage = (template: string) => {
  switch (template) {
    case 'helloworld':
      return tipBase_1_1;
    case 'addn':
      return tipBase_1_2;
    case 'torch_library_template':
      return tipBase_1_3;
    case 'triton_vector_add':
      return tritonVectorAddPreview;
    default:
      return tipBase_1_1;
  }
};

const getProjectPreviewImage = (projectTypeId: OperatorProjectViewIdValue) => {
  if (projectTypeId === OperatorProjectViewId.CANN) {
    return getTemplateImage(selectedTemplate.value);
  }
  if (projectTypeId === OperatorProjectViewId.TRITON) {
    return tritonVectorAddPreview;
  }
  if (projectTypeId === OperatorProjectViewId.STANDARD_CUSTOM) {
    return standardCustomPreview;
  }
  return tipBase_0;
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
  pyascProject,
  tritonProject,
]);

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

    if (currentProjectType.value === 'ascend') {
      items_type.value = [ascendProject];
      selectedId_type.value = OperatorProjectViewId.STANDARD_CUSTOM;
    }
  }
  catch (error) {
    console.error('[Operate] 获取项目类型失败:', error);
    currentProjectType.value = '';
  }
});
</script>
<template>
  <div class="">
    <div class="flex w-full items-stretch max-[960px]:flex-wrap">
      <div class="w-[35%] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0">
        <div
          class="text-base leading-[22px] font-bold mb-6"
          :class="getTextColorClass()"
        >
          {{ t('web.link.projectType') }}
        </div>
        <div class="">
          <div class="mb-5">
            <div
              v-for="item in items_type"
              :key="item.id"
              class="p-5 my-5 border rounded-lg cursor-pointer overflow-hidden relative hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)] group max-[960px]:flex-auto max-[960px]:min-w-0"
              :class="[
                getBorderColorClass(),
                selectedId_type === item.id ? getSelectedBorderClass() : '',
              ]"
              @click="selectedId_type = item.id"
            >
              <div
                class="font-extrabold mb-[25px]"
                :class="getTextColorClass()"
              >
                {{ t(item.titleKey) }}
              </div>
              <div
                class="leading-8 mt-2.5 text-[13px] mb-2.5 whitespace-nowrap overflow-hidden text-ellipsis group-[.selected]:whitespace-normal group-[.selected]:overflow-visible group-[.selected]:text-clip"
                :class="getDescTextClass()"
                v-html="item.id === OperatorProjectViewId.CANN ? getTemplateDesc(selectedTemplate) : t(item.descKey)"
              />
              <a-tag
                v-if="item.id === OperatorProjectViewId.CANN || item.id === OperatorProjectViewId.STANDARD_CUSTOM"
                color="blue"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.langAscendC') }}
              </a-tag>
              <a-tag
                v-if="item.id === OperatorProjectViewId.PYASC || item.id === OperatorProjectViewId.TRITON"
                color="blue"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.langPython') }}
              </a-tag>
              <a-tag
                v-if="item.id === OperatorProjectViewId.CANN"
                color="purple"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.typeAngle') }}
              </a-tag>
              <a-tag
                v-if="item.id === OperatorProjectViewId.STANDARD_CUSTOM"
                color="green"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.typeStandardCustom') }}
              </a-tag>
              <a-tag
                v-if="item.id === OperatorProjectViewId.PYASC"
                color="purple"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.typePyasc') }}
              </a-tag>
              <a-tag
                v-if="item.id === OperatorProjectViewId.TRITON"
                color="purple"
                class="mt-2.5 mr-2"
              >
                {{ t('web.welcome.typeTriton') }}
              </a-tag>
              <div
                v-if="item.id === OperatorProjectViewId.CANN"
                class="mt-4 flex gap-4"
              >
                <a-radio-group
                  v-model:value="selectedTemplate"
                  class="flex gap-4"
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
              <transition name="slide-fade">
                <div
                  v-if="selectedId_type === item.id"
                  class="mt-5 pt-5 border-t"
                  :class="getDividerBorderClass()"
                >
                  <div
                    style="margin-bottom: 20px; margin-top: 20px"
                    :class="getTextColorClass()"
                  >
                    {{ t('web.link.structureDiagram') }}
                  </div>
                  <div class="overflow-hidden max-w-full transition-all duration-300">
                    <a-image
                      :src="getProjectPreviewImage(item.id)"
                      class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                    />
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div
        class="w-px shrink-0 self-stretch mx-4"
        :class="getDividerClass()"
      />
      <div
        class="w-[65%] text-left text-sm font-normal leading-[22px] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0"
        :class="getTextColorClass()"
      >
        <div
          class="text-base leading-[22px] font-bold mb-6"
          :class="getTextColorClass()"
        >
          {{ t('web.link.projectConfig') }}
        </div>
        <a-form
          ref="connectionFormRef"
          :model="projectFormData"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          :rules="connectionFormRules as any"
          layout="vertical"
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
          class="!mt-6 !w-auto !min-w-[84px] !px-4 !h-8 !rounded-none"
          @click="handleCreatedProject"
        >
          {{ t('web.link.createNow') }}
        </a-button>
      </div>
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

.slide-fade-enter-active {
  transition:
    opacity 0.3s ease-out,
    transform 0.3s ease-out;
  overflow: hidden;
}

.slide-fade-leave-active {
  transition:
    opacity 0.3s ease-in,
    transform 0.3s ease-in;
  overflow: hidden;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.slide-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.slide-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
