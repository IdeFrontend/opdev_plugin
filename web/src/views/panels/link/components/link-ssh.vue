<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { t } from 'i18next';
import { useLinkSSH } from '../composables/use-link-ssh';
import { FormRulesFactory } from '../composables/form-rules';
import tipBase_0 from '@/assets/imgs/add.png';
import AscendC from '@/assets/imgs/AscendC.png';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import { getProjectType } from '@web/apis';

const actualTheme = inject('actualTheme', computed(() => 'dark'));

// 根据主题获取文本颜色
const getTextColorClass = () => actualTheme.value === 'dark' ? 'text-white' : 'text-[#1f1f1f]';
// 根据主题获取边框颜色
const getBorderColorClass = () => actualTheme.value === 'dark' ? 'border-[#464646]' : 'border-[#d9d9d9]';
// 根据主题获取选中状态的边框和阴影
const getSelectedBorderClass = () => actualTheme.value === 'dark' 
  ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' 
  : 'border-[#1890ff] shadow-[0_0_0_3px_rgba(24,144,255,0.15)]';
// 根据主题获取分割线颜色（背景色）
const getDividerClass = () => actualTheme.value === 'dark' ? 'bg-white/15' : 'bg-gray-300';
// 根据主题获取边框颜色（用于 border-t 等）
const getDividerBorderClass = () => actualTheme.value === 'dark' ? 'border-white/15' : 'border-gray-300';
// 根据主题获取卡片背景色
const getCardBgClass = () => actualTheme.value === 'dark' ? '' : 'bg-white';
// 根据主题获取描述文本颜色
const getDescTextClass = () => actualTheme.value === 'dark' ? 'text-white' : 'text-[#595959]';

defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

// 模板类型选择
const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template'>('helloworld');

// 使用 composable 获取业务逻辑
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
} = useLinkSSH(selectedTemplate);

const getTemplateDesc = (template: string) => {
  switch (template) {
    case 'helloworld':
      return t('web.welcome.templateDescHelloworld');
    case 'addn':
      return t('web.welcome.templateDescAddn');
    case 'torch_library_template':
      return t('web.welcome.templateDescTorchLibrary');
    default:
      return t('web.welcome.templateDescHelloworld');
  }
};

// 根据模板类型获取图片
const getTemplateImage = (template: string) => {
  switch (template) {
    case 'helloworld':
      return tipBase_1_1;
    case 'addn':
      return tipBase_1_2;
    case 'torch_library_template':
      return tipBase_1_3;
    default:
      return tipBase_1_1;
  }
};

const cannProject = { id: 1, titleKey: 'web.welcome.ascendCOpProject' as const, descKey: 'web.link.ascendCOpDesc' as const };
const ascendProject = { id: 2, titleKey: 'web.welcome.ascendCStandardProject' as const, descKey: 'web.link.ascendCStandardDesc' as const };
const pyascProject = { id: 3, titleKey: 'web.welcome.pythonPyascProject' as const, descKey: 'web.link.pythonPyascDesc' as const };
const items_type = ref([cannProject, pyascProject]);



const connectionFormRules = FormRulesFactory.createFormRules();

const currentProjectType = ref('')
onMounted(async () => {
  // 获取当前项目类型
  try {
    const result = await getProjectType();
    currentProjectType.value = result.projectType || '';
    console.log('[Operate] 当前项目类型:', currentProjectType.value);

    // 标准自定义算子大目录下，只能新建标准自定义算子
    if (currentProjectType.value === 'ascend') {
      items_type.value = [ascendProject]
      selectedId_type.value = 2
    }
  }
  catch (error) {
    console.error('[Operate] 获取项目类型失败:', error);
    currentProjectType.value = '';
  }
})
</script>
<template>
  <div class="">
    <div class="flex w-full items-stretch max-[960px]:flex-wrap">
      <div class="w-[35%] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0">
        <div class="text-base leading-[22px] font-bold mb-6" :class="getTextColorClass()">
          {{ t('web.link.projectType') }}
        </div>
        <div class="">
          <div class="mb-5">
            <div v-for="item in items_type" :key="item.id"
              class="p-5 my-5 border rounded-lg cursor-pointer transition-all duration-300 overflow-hidden relative hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)] group max-[960px]:flex-auto max-[960px]:min-w-0"
              :class="[
                getBorderColorClass(),
                getCardBgClass(),
                selectedId_type === item.id ? getSelectedBorderClass() : '',
              ]" @click="selectedId_type = item.id">
              <div class="font-extrabold text-[initial] mb-[25px]" :class="getTextColorClass()">
                {{ t(item.titleKey) }}
              </div>
              <div
                class="leading-8 mt-2.5 text-[13px] mb-2.5 whitespace-nowrap overflow-hidden text-ellipsis group-[.selected]:whitespace-normal group-[.selected]:overflow-visible group-[.selected]:text-clip"
                :class="getDescTextClass()"
                v-html="item.id === 1 ? getTemplateDesc(selectedTemplate) : t(item.descKey)">
              </div>
              <a-tag v-if="item.id === 1 || item.id === 2" color="blue" class="mt-2.5 mr-2">
                {{ t('web.welcome.langAscendC') }}
              </a-tag>
              <a-tag v-if="item.id === 3" color="blue" class="mt-2.5 mr-2">
                {{ t('web.welcome.langPython') }}
              </a-tag>
              <a-tag v-if="item.id === 1" color="purple" class="mt-2.5 mr-2">
                {{ t('web.welcome.typeAngle') }}
              </a-tag>
              <a-tag v-if="item.id === 2" color="green" class="mt-2.5 mr-2">
                {{ t('web.welcome.typeStandardCustom') }}
              </a-tag>
              <a-tag v-if="item.id === 3" color="purple" class="mt-2.5 mr-2">
                {{ t('web.welcome.typePyasc') }}
              </a-tag>
              <div v-if="item.id === 1" class="mt-4 flex gap-4">
                <a-radio-group v-model:value="selectedTemplate" class="flex gap-4">
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
                <div v-if="selectedId_type === item.id"
                  class="mt-5 pt-5 border-t transition-all duration-300"
                  :class="getDividerBorderClass()">
                  <div style="margin-bottom: 20px; margin-top: 20px" :class="getTextColorClass()">
                    {{ t('web.link.structureDiagram') }}
                  </div>
                  <div class="overflow-hidden max-w-full transition-all duration-300">
                    <a-image v-if="item.id === 2" :src="AscendC"
                      class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                    <a-image v-else :src="item.id === 1 ? getTemplateImage(selectedTemplate) : tipBase_0"
                      class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div class="w-px shrink-0 self-stretch mx-4" :class="getDividerClass()" />
      <div
        class="w-[65%] text-left text-sm font-normal leading-[22px] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0"
        :class="getTextColorClass()">
        <div class="text-base leading-[22px] font-bold mb-6" :class="getTextColorClass()">
          {{ t('web.link.projectConfig') }}
        </div>
        <a-form ref="connectionFormRef" :model="projectFormData" :label-col="{ span: 6 }" :wrapper-col="{ span: 24 }"
          :rules="connectionFormRules as any" layout="vertical">
          <a-form-item name="projectName">
            <template #label>
              <span>{{ t('web.link.projectNameLabel') }}</span>
              <a-tooltip :title="t('web.link.projectNameTooltip')">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-input v-model:value="projectFormData.projectName" :placeholder="t('web.link.projectNamePlaceholder')" />
          </a-form-item>
          <a-form-item name="projectPath">
            <template #label>
              <span>{{ t('web.link.projectPathLabel') }}</span>
              <a-tooltip :title="t('web.link.projectPathTooltip')">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectPath" :options="projectPathOptions"
              :loading="projectPathLoading" :placeholder="t('web.link.projectPathPlaceholder')"
              @search="(val) => remoteSearch('projectPath', val)" @focus="handleSelectFolder" />
          </a-form-item>
          <a-form-item name="projectSH">
            <template #label>
              <span>{{ t('web.link.envScriptLabel') }}</span>
              <a-tooltip :title="t('web.link.envScriptTooltip')">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectSH" :options="projectSHOptions"
              :loading="projectSHLoading" :placeholder="t('web.link.envScriptPlaceholder')"
              @search="(val) => remoteSearch('projectSH', val)" @focus="handleSelectFile" />
          </a-form-item>
        </a-form>
        <a-button type="primary" class="!mt-6 !w-[84px] !h-8 !rounded-none" @click="handleCreatedProject">
          {{ t('web.link.createNow') }}
        </a-button>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
/* 针对整个页面的滚动条 - 深色主题样式 */
::-webkit-scrollbar {
  width: 12px;
  /* 垂直滚动条宽度 */
  height: 12px;
  /* 水平滚动条高度 */
}

/* 滚动条轨道 - 深色主题 */
::-webkit-scrollbar-track {
  background: #1f1f1f;
  /* 轨道背景色 */
  border-radius: 6px;
  /* 轨道圆角 */
}

/* 滚动条滑块 - 深色主题 */
::-webkit-scrollbar-thumb {
  background: #4a4a4a;
  /* 滑块颜色 */
  border-radius: 6px;
  /* 滑块圆角 */
  border: 2px solid #1f1f1f;
  /* 滑块边框，与轨道背景色相同形成间隔效果 */
}

/* 滑块悬停状态 - 深色主题 */
::-webkit-scrollbar-thumb:hover {
  background: #5a5a5a;
  /* 悬停时颜色变深 */
}

/* 滑块激活状态（点击时） - 深色主题 */
::-webkit-scrollbar-thumb:active {
  background: #3a3a3a;
  /* 点击时颜色更深 */
}

/* 滚动条角落（垂直和水平滚动条交汇处） - 深色主题 */
::-webkit-scrollbar-corner {
  background: #1f1f1f;
}

// 展开/收缩动画
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
