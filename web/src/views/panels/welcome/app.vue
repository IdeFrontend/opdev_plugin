<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="welcome-page w-full min-h-screen px-20 py-10 font-['Microsoft_Yahei',sans-serif] flex flex-col items-center relative box-border max-[992px]:px-[30px] max-[992px]:py-[20px] max-[576px]:p-[15px]"
      @click="handleClick">
      <!-- 背景层（芯片图 + 主题色遮罩） -->
      <div class="welcome-overlay absolute top-0 left-0 w-full h-full bg-cover z-[1]" />

      <!-- 内容层 -->
      <div
        class="relative z-[2] w-full h-full flex flex-col items-center justify-center px-[50px] box-border">
        <!-- 顶部标题区域 -->
        <div class="text-center mb-8 w-full max-[992px]:mb-[20px]">
          <h5 class="text-[25px] font-normal m-0 mb-2.5">
            {{ t('web.welcome.welcomeTitle') }}
          </h5>
          <h1 class="text-[32px] font-semibold m-0">
            {{ t('web.welcome.platformTitle') }}
          </h1>
        </div>

        <!-- 导航步骤条（位于标题和核心功能模块之间） -->
        <div class="w-full flex justify-center mb-8 max-[992px]:mb-6">
          <a-steps class="welcome-steps max-w-[1200px] w-full" type="navigation" :current="currentStep"
            @change="onStepChange">
            <a-step>
              <template #icon>
                <img :src="settingIcon" :alt="t('web.welcome.stepNewProject')" class="step-icon" />
              </template>
              <template #title>{{ t('web.welcome.stepNewProject') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="buildIcon" :alt="t('web.welcome.stepDev')" class="step-icon" />
              </template>
              <template #title>{{ t('web.welcome.stepDev') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="checkIcon" :alt="t('web.welcome.stepSanitizer')" class="step-icon" />
              </template>
              <template #title>{{ t('web.welcome.stepSanitizer') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="powerIcon" :alt="t('web.welcome.stepPerformance')" class="step-icon" />
              </template>
              <template #title>{{ t('web.welcome.stepPerformance') }}</template>
            </a-step>
          </a-steps>
        </div>

        <!-- 核心功能模块区域：根据步骤展示 4 个面板 -->
        <div
          class="welcome-card flex items-stretch justify-center gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[300px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px]"
          @click.stop>
          <!-- Step 0 / 1: 新建算子工程 -->
          <div v-show="currentStep === 0"
            class="flex-1 rounded-lg box-border flex flex-col min-w-0 max-[992px]:p-[15px] max-[576px]:p-3">
            <h3 class="text-[20px] font-semibold mb-3">
              {{ t('web.welcome.sectionNewProject') }}
            </h3>
            <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs">
              {{ t('web.welcome.sectionNewProjectDesc') }}
            </p>
            <div class="mb-6">
              <a-button type="primary" @click="handleAscendCProject">
                {{ t('web.welcome.createNow') }}
              </a-button>
            </div>

            <!-- 工程类型展示（3 种类型横向排列） -->
            <div class="mt-2">
              <div class="flex gap-4 max-[992px]:flex-col">
                <!-- 【Ascend C】<<<>>>算子工程 -->
                <div class="project-type-card flex-1 p-4 rounded-lg overflow-hidden relative">
                  <div class="font-extrabold mb-3">
                    {{ t('web.welcome.ascendCOpProject') }}
                  </div>
                  <div class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal"
                    v-html="getTemplateDesc(selectedTemplate)" />
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langAscendC') }}
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    {{ t('web.welcome.typeAngle') }}
                  </a-tag>
                  <div class="mt-4 flex items-center gap-3">
                    <span class="text-[13px] whitespace-nowrap">
                      {{ t('web.welcome.sample') }}
                    </span>
                    <a-radio-group v-model:value="selectedTemplate" class="sample-radio-group flex gap-4">
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
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image :src="getTemplateImage(selectedTemplate)"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                    </div>
                  </div>
                </div>

                <!-- 【Ascend C】标准自定义算子工程 -->
                <div class="project-type-card flex-1 p-4 rounded-lg overflow-hidden relative">
                  <div class="font-extrabold mb-3">
                    {{ t('web.welcome.ascendCStandardProject') }}
                  </div>
                  <div class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal">
                    {{ t('web.welcome.ascendCStandardDesc') }}
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langAscendC') }}
                  </a-tag>
                  <a-tag color="green" class="mt-2 mr-2">
                    {{ t('web.welcome.typeStandardCustom') }}
                  </a-tag>
                  <div class="mt-4">
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image :src="tipBase_0"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                    </div>
                  </div>
                </div>

                <!-- 【Python】pyasc算子工程 -->
                <div class="project-type-card flex-1 p-4 rounded-lg overflow-hidden relative">
                  <div class="font-extrabold mb-3">
                    {{ t('web.welcome.pythonPyascProject') }}
                  </div>
                  <div class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal">
                    {{ t('web.welcome.pythonPyascDesc') }}
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langPython') }}
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    {{ t('web.welcome.typePyasc') }}
                  </a-tag>
                  <div class="mt-4">
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image :src="tipBase_0"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        <!-- Step 1 / 2: 算子开发 -->
        <div
          v-show="currentStep === 1"
          class="flex-1 box-border flex min-w-0"
        >
          <!-- 左侧：算子开发文案与要点 -->
          <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
            <h3 class="text-[20px] font-semibold mb-6">
              {{ t('web.welcome.sectionDev') }}
            </h3>
            <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs">
              {{ t('web.welcome.sectionDevDesc') }}
            </p>
            <ul
              class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold leading-[32px] max-[576px]:grid-cols-1"
            >
              <li>{{ t('web.welcome.featureTiling') }}</li>
              <li>{{ t('web.welcome.featureKernel') }}</li>
              <li>{{ t('web.welcome.featureHighlight') }}</li>
              <li>{{ t('web.welcome.featureCompletion') }}</li>
              <li>{{ t('web.welcome.featureCompileDeploy') }}</li>
            </ul>
            <a-button
              type="link"
              class="!p-0 !h-auto text-[14px]"
            >
              {{ t('web.welcome.viewGuide') }}
            </a-button>
          </div>

          <!-- 右侧：算子开发 3 个步骤示意 Tab -->
          <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
            <a-tabs v-model:activeKey="devTabKey">
              <a-tab-pane key="code" :tab="t('web.welcome.tabWriteCode')">
                <a-image
                  :src="writeImg"
                  class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                />
              </a-tab-pane>
              <a-tab-pane key="build" :tab="t('web.welcome.tabCompileDeploy')">
                <a-image
                  :src="buildImg"
                  class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                />
              </a-tab-pane>
              <a-tab-pane key="run" :tab="t('web.welcome.tabRun')">
                <a-image
                  :src="runImg"
                  class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                />
              </a-tab-pane>
            </a-tabs>
          </div>
        </div>

          <!-- Step 2 / 3: 算子异常检测 -->
          <div
            v-show="currentStep === 2"
            class="flex-1 box-border flex min-w-0"
          >
            <!-- 左侧：算子异常检测介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionSanitizer') }}
              </h3>
              <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs">
                {{ t('web.welcome.sectionSanitizerDesc') }}
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px]"
              >
                <li>{{ t('web.welcome.featureMemory') }}</li>
                <li>{{ t('web.welcome.featureRace') }}</li>
                <li>{{ t('web.welcome.featureUninit') }}</li>
              </ul>
              <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs" v-html="t('web.welcome.sanitizerSteps')" />
              <a-button
                type="link"
                class="!p-0 !h-auto text-[14px]"
              >
                {{ t('web.welcome.viewGuide') }}
              </a-button>
            </div>

            <!-- 右侧：异常检测界面示意图 -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-image
                :src="checkImg"
                class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>

          <!-- Step 3 / 4: 算子性能调优 -->
          <div
            v-show="currentStep === 3"
            class="flex-1 box-border flex min-w-0"
          >
            <!-- 左侧：算子性能调优介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionPerformance') }}
              </h3>
              <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs">
                {{ t('web.welcome.sectionPerformanceDesc') }}
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px]"
              >
                <li>{{ t('web.welcome.featureOnboard') }}</li>
                <li>{{ t('web.welcome.featureSimulation') }}</li>
              </ul>
              <p class="welcome-text-muted text-[14px] leading-relaxed mb-6 max-[576px]:text-xs" v-html="t('web.welcome.performanceSteps')" />
              <a-button
                type="link"
                class="!p-0 !h-auto text-[14px]"
              >
                {{ t('web.welcome.viewGuide') }}
              </a-button>
            </div>

            <!-- 右侧：性能调优分析界面示意图 -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-image
                :src="analysisImg"
                class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>
        </div>

        <!-- 底部步骤导航 -->
        <div
          class="w-full flex justify-center items-center gap-6 mt-4 text-[14px]"
          @click.stop
        >
          <span
            v-if="currentStep > 0"
            class="welcome-link cursor-pointer transition-colors"
            @click="goPrevStep"
          >
            {{ t('web.welcome.prevStep') }}
          </span>
          <span
            v-if="currentStep < 3"
            class="welcome-link cursor-pointer transition-colors"
            @click="goNextStep"
          >
            {{ t('web.welcome.nextStep') }}
          </span>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { t } from 'i18next';
import { useTheme } from '@web/composables/use-theme';
import settingIcon from '@/assets/svg/setting.svg';
import buildIcon from '@/assets/svg/build.svg';
import checkIcon from '@/assets/svg/check.svg';
import powerIcon from '@/assets/svg/power.svg';
import tipBase_0 from '@/assets/imgs/add.png';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import writeImg from '@/assets/imgs/write.png';
import buildImg from '@/assets/imgs/build.jpeg';
import runImg from '@/assets/imgs/run.jpeg';
import checkImg from '@/assets/imgs/check.png';
import analysisImg from '@/assets/imgs/analysis.png';

const { themeConfig } = useTheme();

const currentStep = ref(0);
const devTabKey = ref('code');

const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template'>(
  'helloworld',
);

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

const handleClick = () => {
  if (window.vscode) {
    window.vscode.postMessage({
      command: 'vscodeOpenSidebar',
      message: {},
    });
  }
};

const handleAscendCProject = () => {
  if (window.vscode) {
    window.vscode.postMessage({
      command: 'openLinkWebviewPanel',
      commandId: 'my-extension.openProjectView',
    });
  }
};

const onStepChange = (step: number) => {
  currentStep.value = step;
  console.log('step changed: ', step);
};

const goPrevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value -= 1;
  }
};

const goNextStep = () => {
  if (currentStep.value < 3) {
    currentStep.value += 1;
  }
};
</script>

<style scoped>
.welcome-page {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

.welcome-overlay {
  background-color: var(--vscode-editor-background);
  opacity: 0.85;
}

.welcome-card {
  background-color: var(--vscode-editorWidget-background);
}

.welcome-text-muted {
  color: var(--vscode-descriptionForeground);
}

.welcome-link {
  color: var(--vscode-textLink-foreground);
}

.welcome-link:hover {
  color: var(--vscode-textLink-activeForeground);
}

.project-type-card {
  background: transparent;
  border: 1px solid var(--vscode-panel-border);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.project-type-card:hover {
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
}

.icon {
  margin-right: 12px;
}

.op-create-icon {
  background: url('../../../../resources/welcomePage/welcome_op_create_color.svg') no-repeat center;
  background-size: contain;
  width: 26px;
  height: 26px;
}

.op-impl-icon {
  background: url('../../../../resources/welcomePage/welcome_op_impl_color.svg') no-repeat center;
  background-size: contain;
  width: 28px;
  height: 28px;
}

.op-inspect-icon {
  background: url('../../../../resources/welcomePage/welcome_op_inspect_color.svg') no-repeat center;
  background-size: contain;
  width: 24px;
  height: 24px;
}

.create-op-icon {
  display: block;
  height: 1.6em;
  aspect-ratio: 22 / 26;
  background: url('../../../../resources/welcomePage/welcome_op_create_color.svg') no-repeat center;
  background-size: contain;
}

.btn-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  flex-shrink: 0;
  background: url('../../../../resources/welcomePage/welcome_bullet_mono.svg') no-repeat center;
  background-size: contain;
  vertical-align: middle;
}

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

.welcome-steps {
  color: var(--vscode-editor-foreground);
}

.welcome-steps .ant-steps-item {
  color: var(--vscode-editor-foreground);
}

.welcome-steps .ant-steps-item::after {
  border-color: var(--vscode-editor-foreground);
}

.welcome-steps .ant-steps-item-icon {
  background: transparent;
  border-color: var(--vscode-editor-foreground);
}

:deep(.welcome-steps .ant-steps-item .ant-steps-item-container .ant-steps-item-content .ant-steps-item-title) {
  font-size: 18px;
  color: var(--vscode-editor-foreground);
}

.welcome-steps .ant-steps-item-icon,
.welcome-steps .ant-steps-item-content {
  display: flex;
  align-items: center;
}

.step-icon {
  width: 22px;
  height: 22px;
  display: block;
}

:deep(.sample-radio-group .ant-radio-wrapper) {
  color: var(--vscode-editor-foreground);
}

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
