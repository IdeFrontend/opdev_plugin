<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="w-full min-h-screen px-20 py-10 font-['Microsoft_Yahei',sans-serif] flex flex-col items-center relative box-border max-[992px]:px-[30px] max-[992px]:py-[20px] max-[576px]:p-[15px] bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]"
      @click="handleClick"
    >
      <!-- 背景层（芯片图 + 深色遮罩） -->
      <div class="absolute top-0 left-0 w-full h-full bg-cover bg-opacity-90 bg-blend-overlay z-[1] bg-[var(--vscode-editor-background)]" />

      <!-- 内容层 -->
      <div
        class="relative z-[2] w-full h-full flex flex-col items-center justify-center px-[50px] box-border text-[var(--vscode-foreground)]"
      >
        <!-- 顶部标题区域 -->
        <div class="text-center mb-8 w-full max-[992px]:mb-[20px]">
          <h1 class="text-[32px] font-semibold m-0">
            {{ t('web.welcome.platformTitle') }}
          </h1>
        </div>

        <!-- 导航步骤条（位于标题和核心功能模块之间） -->
        <div class="w-full flex justify-center mb-8 max-[992px]:mb-6">
          <a-steps
            class="welcome-steps w-full"
            type="navigation"
            :current="currentStep"
            @change="onStepChange"
          >
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepNewProject')"
                  v-html="settingIconSvg"
                />
              </template>
              <template #title>
                {{ t('web.welcome.stepNewProject') }}
              </template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepDev')"
                  v-html="buildIconSvg"
                />
              </template>
              <template #title>
                {{ t('web.welcome.stepDev') }}
              </template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepDebug')"
                  v-html="debugIconSvg"
                />
              </template>
              <template #title>
                {{ t('web.welcome.stepDebug') }}
              </template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepSanitizer')"
                  v-html="checkIconSvg"
                />
              </template>
              <template #title>
                {{ t('web.welcome.stepSanitizer') }}
              </template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepPerformance')"
                  v-html="powerIconSvg"
                />
              </template>
              <template #title>
                {{ t('web.welcome.stepPerformance') }}
              </template>
            </a-step>
          </a-steps>
        </div>

        <!-- 核心功能模块区域：根据步骤展示 5 个面板 -->
        <div
          class="flex items-stretch justify-center gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[300px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px] bg-[var(--vscode-editorWidget-background)] shadow-md"
          @click.stop
        >
          <!-- Step 0: 新建算子工程 -->
          <div
            v-show="currentStep === 0"
            class="welcome-step-body -mt-3 flex-1 box-border flex flex-col gap-0 min-w-0 w-full text-[var(--vscode-editor-foreground)]"
          >
            <p class="welcome-step-intro mb-4 w-full shrink-0 text-[15px] max-[576px]:text-[14px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionNewProjectDesc') }}
            </p>

            <div class="flex w-full min-h-0 min-w-0 flex-1 flex-col gap-4">
              <div
                class="welcome-step-media-tabs welcome-new-project-tabs box-border w-full min-h-0 min-w-0 flex-1"
              >
                <a-tabs
                  v-model:active-key="projectTypeTabKey"
                  class="w-full"
                  tab-position="left"
                >
                  <a-tab-pane
                    :key="String(OperatorProjectViewId.CANN)"
                    :tab="t('web.welcome.ascendCOpProject')"
                  >
                    <div
                      class="welcome-new-project-tab-desc mb-2.5 whitespace-normal"
                      v-html="getTemplateDesc(selectedTemplate)"
                    />
                    <a-tag
                      color="blue"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.langAscendC') }}
                    </a-tag>
                    <a-tag
                      color="purple"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.typeAngle') }}
                    </a-tag>
                    <div class="mt-4">
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
                          :files="selectedTemplatePreviewFiles"
                          class="welcome-new-project-preview block transition-opacity duration-300 transform"
                        />
                      </div>
                    </div>
                  </a-tab-pane>

                  <a-tab-pane
                    :key="String(OperatorProjectViewId.STANDARD_CUSTOM)"
                    :tab="t('web.welcome.ascendCStandardProject')"
                  >
                    <div class="welcome-new-project-tab-desc mb-2.5 whitespace-normal">
                      {{ t('web.welcome.ascendCStandardDesc') }}
                    </div>
                    <a-tag
                      color="blue"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.langAscendC') }}
                    </a-tag>
                    <a-tag
                      color="green"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.typeStandardCustom') }}
                    </a-tag>
                    <div class="mt-4">
                      <div class="transition-all duration-300">
                        <TemplatePreview
                          :files="standardProjectPreviewFiles"
                          class="welcome-new-project-preview block transition-opacity duration-300 transform"
                        />
                      </div>
                    </div>
                  </a-tab-pane>

                  <a-tab-pane
                    :key="String(OperatorProjectViewId.PYASC)"
                    :tab="t('web.welcome.pythonPyascProject')"
                  >
                    <div class="welcome-new-project-tab-desc mb-2.5 whitespace-normal">
                      {{ t('web.welcome.pythonPyascDesc') }}
                    </div>
                    <a-tag
                      color="blue"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.langPython') }}
                    </a-tag>
                    <a-tag
                      color="purple"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.typePyasc') }}
                    </a-tag>
                    <div class="mt-4">
                      <div class="transition-all duration-300">
                        <TemplatePreview
                          :files="pyascProjectPreviewFiles"
                          class="welcome-new-project-preview block transition-opacity duration-300 transform"
                        />
                      </div>
                    </div>
                  </a-tab-pane>

                  <a-tab-pane
                    v-if="tritonSupportEnabled"
                    :key="String(OperatorProjectViewId.TRITON)"
                    :tab="t('web.welcome.pythonTritonProject')"
                  >
                    <div class="welcome-new-project-tab-desc mb-2.5 whitespace-normal">
                      {{ t('web.welcome.pythonTritonDesc') }}
                    </div>
                    <a-tag
                      color="blue"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.langPython') }}
                    </a-tag>
                    <a-tag
                      color="purple"
                      class="mt-2 mr-2"
                    >
                      {{ t('web.welcome.typeTriton') }}
                    </a-tag>
                    <div class="mt-4">
                      <div class="transition-all duration-300">
                        <TemplatePreview
                          :files="tritonProjectPreviewFiles"
                          class="welcome-new-project-preview block transition-opacity duration-300 transform"
                        />
                      </div>
                    </div>
                  </a-tab-pane>
                </a-tabs>
              </div>

              <div class="flex w-full shrink-0 flex-col items-center">
                <button
                  type="button"
                  :class="[
                    'rounded-md border border-transparent transition-colors duration-150 cursor-pointer',
                    'px-10 py-5 text-xl max-[576px]:px-8 max-[576px]:py-4 max-[576px]:text-lg',
                    'bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)]'
                  ]"
                  @click="handleAscendCProject"
                >
                  {{ t('web.welcome.createNow') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Step 1: 算子开发（简介 → 媒体） -->
          <div
            v-show="currentStep === 1"
            class="welcome-step-body -mt-3 flex-1 box-border flex flex-col gap-0 min-w-0 w-full text-[var(--vscode-editor-foreground)]"
          >
            <p class="welcome-step-intro mb-1 w-full shrink-0 text-[15px] max-[576px]:text-[14px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionDevDesc') }}
            </p>

            <div class="w-full min-w-0 welcome-step-media-tabs">
              <a-tabs v-model:active-key="devTabKey">
                <a-tab-pane
                  key="code"
                  :tab="t('web.welcome.tabWriteCode')"
                >
                  <a-image
                    :src="writeImg"
                    class="welcome-media-full transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="build"
                  :tab="t('web.welcome.tabCompileDeploy')"
                >
                  <video
                    :src="buildImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="run"
                  :tab="t('web.welcome.tabRun')"
                >
                  <video
                    :src="runImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>

          <!-- Step 2: 算子调试（简介 → 视频） -->
          <div
            v-show="currentStep === 2"
            class="welcome-step-body -mt-3 flex-1 box-border flex flex-col gap-0 min-w-0 w-full text-[var(--vscode-editor-foreground)]"
          >
            <p class="welcome-step-intro mb-[18px] max-[992px]:mb-[13px] max-[576px]:mb-2 w-full shrink-0 text-[15px] max-[576px]:text-[14px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionDebugDesc') }}
            </p>

            <div class="w-full min-w-0">
              <video
                :src="debug"
                autoplay
                loop
                muted
                playsinline
                class="welcome-media-full object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>

          <!-- Step 3: 算子异常检测（简介 → 媒体） -->
          <div
            v-show="currentStep === 3"
            class="welcome-step-body -mt-3 flex-1 box-border flex flex-col gap-0 min-w-0 w-full text-[var(--vscode-editor-foreground)]"
          >
            <p class="welcome-step-intro mb-1 w-full shrink-0 text-[15px] max-[576px]:text-[14px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionSanitizerDesc') }}
            </p>

            <div class="w-full min-w-0 welcome-step-media-tabs">
              <a-tabs v-model:active-key="checkTabKey">
                <a-tab-pane
                  key="select"
                  :tab="t('web.welcome.tabSelectCheckContent')"
                >
                  <video
                    :src="selectCheckImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="result"
                  :tab="t('web.welcome.tabViewCheckResult')"
                >
                  <video
                    :src="checkImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>

          <!-- Step 4: 算子性能调优（简介 → 媒体） -->
          <div
            v-show="currentStep === 4"
            class="welcome-step-body -mt-3 flex-1 box-border flex flex-col gap-0 min-w-0 w-full text-[var(--vscode-editor-foreground)]"
          >
            <p class="welcome-step-intro mb-1 w-full shrink-0 text-[15px] max-[576px]:text-[14px] leading-relaxed text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionPerformanceDesc') }}
            </p>

            <div class="w-full min-w-0 welcome-step-media-tabs">
              <a-tabs v-model:active-key="perfTabKey">
                <a-tab-pane
                  key="select"
                  :tab="t('web.welcome.tabSelectAnalysisContent')"
                >
                  <video
                    :src="selectAnalysisImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="result"
                  :tab="t('web.welcome.tabViewAnalysisResult')"
                >
                  <video
                    :src="analysisImg"
                    autoplay
                    loop
                    muted
                    playsinline
                    class="welcome-media-full object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import {
  computed, onMounted, ref,
} from 'vue';
import { t } from 'i18next';
import { useTheme } from '@web/composables/use-theme';
import {
  OperatorProjectViewId,
  isOperatorProjectViewId,
  type OperatorProjectViewIdValue,
} from '@shared/project-type-view-id';
import { getProjectTypeSupportEnabled } from '@web/apis';
import settingIconRaw from '@/assets/svg/setting.svg?raw';
import buildIconRaw from '@/assets/svg/build.svg?raw';
import checkIconRaw from '@/assets/svg/check.svg?raw';
import debugIconRaw from '@/assets/svg/debug.svg?raw';
import powerIconRaw from '@/assets/svg/power.svg?raw';
import TemplatePreview from '@/components/template-previews/template-preview.vue';
import {
  getProjectPreviewFiles,
  getTemplatePreviewFiles,
} from '@/components/template-previews/template-preview-files';
import writeImg from '@/assets/imgs/write.webp';
import buildImg from '@/assets/imgs/build.mp4';
import runImg from '@/assets/imgs/run.mp4';
import debug from '@/assets/imgs/debug.mp4';
import checkImg from '@/assets/imgs/check.mp4';
import selectCheckImg from '@/assets/imgs/selectCheck.mp4';
import analysisImg from '@/assets/imgs/analysis.mp4';
import selectAnalysisImg from '@/assets/imgs/selectAnalysis.mp4';

const { themeConfig } = useTheme();

const toCurrentColorSvg = (svg: string) =>
  svg
    .replace(/fill="(?!none|transparent|currentColor)[^"]*"/gi, 'fill="currentColor"')
    .replace(/stroke="(?!none|transparent|currentColor)[^"]*"/gi, 'stroke="currentColor"');

const settingIconSvg = toCurrentColorSvg(settingIconRaw);
const buildIconSvg = toCurrentColorSvg(buildIconRaw);
const checkIconSvg = toCurrentColorSvg(checkIconRaw);
const debugIconSvg = toCurrentColorSvg(debugIconRaw);
const powerIconSvg = toCurrentColorSvg(powerIconRaw);

const currentStep = ref(0);
const devTabKey = ref('code');
const checkTabKey = ref('select');
const perfTabKey = ref('select');

// 新建算子工程：当前选中的工程类型（<<<>>> / 标准自定义 / pyasc / triton），默认 <<<>>>
const selectedProjectTypeId = ref<OperatorProjectViewIdValue>(OperatorProjectViewId.CANN);

const projectTypeTabKey = computed<string>({
  get: () => String(selectedProjectTypeId.value),
  set: (key: string) => {
    const id = Number(key);

    if (isOperatorProjectViewId(id)) {
      selectedProjectTypeId.value = id;
    }
  },
});

// <<<>>> 算子工程模板选择（helloworld / addn / torch_library）
const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add'>('helloworld');
const tritonSupportEnabled = ref(false);
const selectedTemplatePreviewFiles = computed(() => getTemplatePreviewFiles(selectedTemplate.value) ?? []);
const standardProjectPreviewFiles = getProjectPreviewFiles(OperatorProjectViewId.STANDARD_CUSTOM) ?? [];
const pyascProjectPreviewFiles = getProjectPreviewFiles(OperatorProjectViewId.PYASC) ?? [];
const tritonProjectPreviewFiles = getProjectPreviewFiles(OperatorProjectViewId.TRITON) ?? [];

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

const handleClick = () => {
  if (window.vscode) {
    window.vscode.postMessage({
      command: 'vscodeOpenSidebar',
      message: {},
    });
  }
};

// 处理Ascend C算子工程按钮点击
const handleAscendCProject = () => {
  if (window.vscode) {
    window.vscode.postMessage({
      command: 'openLinkWebviewPanel',
      commandId: 'my-extension.openProjectView',
    });
  }
};

// 步骤条点击：仅切换当前高亮，不改变核心模块展示
const onStepChange = (step: number) => {
  currentStep.value = step;
  console.log('step changed: ', step);
};

onMounted(async () => {
  try {
    tritonSupportEnabled.value = await getProjectTypeSupportEnabled(OperatorProjectViewId.TRITON);
  }
  catch (error) {
    console.error('[Welcome] Failed to read project type support setting:', error);
    tritonSupportEnabled.value = false;
  }

  if (!tritonSupportEnabled.value && selectedProjectTypeId.value === OperatorProjectViewId.TRITON) {
    selectedProjectTypeId.value = OperatorProjectViewId.CANN;
  }
});

</script>

<style scoped>
/* Keeping complex icon backgrounds in CSS for now */
.icon {
  margin-right: 12px;
}

.op-create-icon {
  background: url('@/assets/welcomePage/welcome_op_create_color.svg') no-repeat center;
  background-size: contain;
  width: 26px;
  height: 26px;
}

.op-impl-icon {
  background: url('@/assets/welcomePage/welcome_op_impl_color.svg') no-repeat center;
  background-size: contain;
  width: 28px;
  height: 28px;
}

.op-inspect-icon {
  background: url('@/assets/welcomePage/welcome_op_inspect_color.svg') no-repeat center;
  background-size: contain;
  width: 24px;
  height: 24px;
}

.create-op-icon {
  display: block;
  height: 1.6em;
  aspect-ratio: 22 / 26;
  background: url('@/assets/welcomePage/welcome_op_create_color.svg') no-repeat center;
  background-size: contain;
}

.btn-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  flex-shrink: 0;
  background: url('@/assets/welcomePage/welcome_bullet_mono.svg') no-repeat center;
  background-size: contain;
  vertical-align: middle;
}

/* Functional Buttons */
.func-btn {
  background-color: var(--vscode-button-secondaryBackground);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  color: var(--vscode-button-secondaryForeground);
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
  min-height: 36px;
  height: auto;
  text-align: left;
  display: flex;
  align-items: center;
  word-break: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
}

/* 欢迎页导航步骤条（a-steps navigation） */
.welcome-steps {
  color: var(--vscode-icon-foreground, var(--vscode-foreground));
  overflow: hidden;
}

.welcome-steps .ant-steps-item {
  color: var(--vscode-descriptionForeground, var(--vscode-foreground));
}

.welcome-steps .ant-steps-item-process {
  color: var(--vscode-textLink-foreground, var(--vscode-foreground));
}

.welcome-steps .ant-steps-item-finish {
  color: var(--vscode-foreground);
}

/* Navigation chevron: keep Ant Design positioning (nav.js), only theme the stroke */
:deep(.welcome-steps.ant-steps-navigation .ant-steps-item::after) {
  border-top-color: currentColor;
  border-inline-end-color: currentColor;
  /* Ant default: top calc(50% - paddingSM/2); transform translateY(-50%) translateX(-50%) rotate(45deg) */
  top: calc(50% - 6px);
  transform: translateY(calc(-50% + 1px)) translateX(-50%) rotate(45deg);
}

.welcome-steps .ant-steps-item-description {
  display: none;
}

.welcome-steps .ant-steps-item-icon {
  background: transparent;
  border-color: var(--vscode-panel-border);
}

:deep(.welcome-steps .ant-steps-item-container) {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.welcome-steps .ant-steps-item-icon) {
  margin-right: 6px;
}

:deep(.welcome-steps .ant-steps-item-content) {
  min-width: 0;
}

:deep(.welcome-steps .ant-steps-item .ant-steps-item-container .ant-steps-item-content .ant-steps-item-title) {
  font-size: 18px;
  color: currentColor;
  line-height: 1;
  display: flex;
  align-items: center;
}

/* Prevent title truncation in all locales */
:deep(.welcome-steps .ant-steps-item-title) {
  max-width: none !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  word-break: normal;
  overflow-wrap: normal;
}

.step-icon {
  width: 22px;
  height: 22px;
  display: block;
}

.step-icon-svg {
  color: currentColor;
  line-height: 0;
}

/* Inactive steps: match workbench icon tint (not description text color) */
:deep(.welcome-steps .ant-steps-item-wait .step-icon-svg),
:deep(.welcome-steps .ant-steps-item-finish .step-icon-svg) {
  color: var(--vscode-icon-foreground);
}

:deep(.step-icon-svg svg) {
  width: 100%;
  height: 100%;
  display: block;
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

.welcome-step-media-tabs.welcome-new-project-tabs :deep(.ant-tabs-left .ant-tabs-content-holder) {
  width: auto;
}

.welcome-step-media-tabs :deep(.ant-tabs-content-holder),
.welcome-step-media-tabs :deep(.ant-tabs-content),
.welcome-step-media-tabs :deep(.ant-tabs-tabpane) {
  width: 100%;
}

.welcome-media-full {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}

.welcome-step-media-tabs :deep(.ant-image) {
  display: block;
  width: 100%;
}

.welcome-step-media-tabs :deep(.ant-image-img) {
  width: 100% !important;
  height: auto !important;
  object-fit: contain;
}

.welcome-step-media-tabs.welcome-new-project-tabs :deep(.ant-image) {
  display: inline-block !important;
  width: auto !important;
  max-width: none;
}

.welcome-step-media-tabs.welcome-new-project-tabs :deep(.ant-image-img) {
  width: auto !important;
  max-width: none !important;
  height: auto !important;
  object-fit: none;
}

/* Responsive adjustments for buttons that are hard to do purely with utility classes inline without getting messy */
@media (max-width: 992px) {
  .func-btn {
    font-size: 12px;
    padding: 8px 10px;
    min-height: 32px;
  }
}

@media (max-width: 576px) {
  .func-btn {
    padding: 6px 8px;
    font-size: 11px;
    min-height: 28px;
  }

  .btn-icon {
    width: 12px;
    height: 12px;
    margin-right: 4px;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes slideInFromRight {
  from {
    transform: translateX(20px);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
