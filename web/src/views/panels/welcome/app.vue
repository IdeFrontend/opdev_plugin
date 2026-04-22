<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="w-full min-h-screen px-20 py-10 font-['Microsoft_Yahei',sans-serif] flex flex-col items-center relative box-border max-[992px]:px-[30px] max-[992px]:py-[20px] max-[576px]:p-[15px] bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]"
      @click="handleClick">
      <!-- 背景层（芯片图 + 深色遮罩） -->
      <div class="absolute top-0 left-0 w-full h-full bg-cover bg-opacity-90 bg-blend-overlay z-[1] bg-[var(--vscode-editor-background)]" />

      <!-- 内容层 -->
      <div
        class="relative z-[2] w-full h-full flex flex-col items-center justify-center px-[50px] box-border text-[var(--vscode-foreground)]">
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
          <a-steps class="welcome-steps w-full" type="navigation" :current="currentStep"
            @change="onStepChange">
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepNewProject')"
                  v-html="settingIconSvg"
                />
              </template>
              <template #title>{{ t('web.welcome.stepNewProject') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepDev')"
                  v-html="buildIconSvg"
                />
              </template>
              <template #title>{{ t('web.welcome.stepDev') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepDebug')"
                  v-html="debugIconSvg"
                />
              </template>
              <template #title>{{ t('web.welcome.stepDebug') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepSanitizer')"
                  v-html="checkIconSvg"
                />
              </template>
              <template #title>{{ t('web.welcome.stepSanitizer') }}</template>
            </a-step>
            <a-step>
              <template #icon>
                <span
                  class="step-icon step-icon-svg"
                  :aria-label="t('web.welcome.stepPerformance')"
                  v-html="powerIconSvg"
                />
              </template>
              <template #title>{{ t('web.welcome.stepPerformance') }}</template>
            </a-step>
          </a-steps>
        </div>

        <!-- 核心功能模块区域：根据步骤展示 5 个面板 -->
        <div
          class="flex items-stretch justify-center gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[300px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px] bg-[var(--vscode-editorWidget-background)] shadow-md"
          @click.stop>
          <!-- Step 0 / 1: 新建算子工程 -->
          <div
            v-show="currentStep === 0"
            class="flex-1 box-border flex min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：标题、描述、立即创建 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionNewProject') }}
              </h3>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionNewProjectDesc') }}
              </p>
              <ul class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold leading-[32px] max-[576px]:grid-cols-1 text-[var(--vscode-editor-foreground)]">
                <li>{{ t('web.welcome.featureEnvReady') }}</li>
                <li>{{ t('web.welcome.featureAscendC') }}</li>
                <li>{{ t('web.welcome.featurePyascProjectShort') }}</li>
              </ul>
              <div>
                <button
                  :class="[
                    'px-5 py-2.5 rounded-md border border-transparent transition-colors duration-150 cursor-pointer',
                    actualTheme === 'dark' 
                      ? 'bg-[#3d8bfd] hover:bg-[#5b9dff] text-white' 
                      : 'bg-[#1890ff] hover:bg-[#40a9ff] text-white'
                  ]"
                  @click="handleAscendCProject"
                >
                  {{ t('web.welcome.createNow') }}
                </button>
              </div>
            </div>

            <!-- 右侧：工程类型（3 种类型纵向排列） -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <div class="flex flex-col gap-4">
                <!-- 【Ascend C】<<<>>>算子工程 -->
                <div
                  :class="[
                    'flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]',
                    selectedProjectTypeId === 1 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : (actualTheme === 'dark' ? 'border-[#464646]' : 'border-gray-300')
                  ]"
                  @click="selectedProjectTypeId = 1"
                >
                  <div :class="[
                    'font-extrabold text-[initial] mb-3',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-800'
                  ]">
                    {{ t('web.welcome.ascendCOpProject') }}
                  </div>
                  <div :class="[
                    'leading-7 mt-1 text-[12px] mb-2.5 whitespace-normal',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-700'
                  ]"
                    v-html="getTemplateDesc(selectedTemplate)" />
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langAscendC') }}
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    {{ t('web.welcome.typeAngle') }}
                  </a-tag>
                  <template v-if="selectedProjectTypeId === 1">
                    <div class="mt-4 flex items-center gap-3">
                      <span :class="[
                        'text-[13px] whitespace-nowrap',
                        actualTheme === 'dark' ? 'text-[#ffffff]' : 'text-gray-800'
                      ]">
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
                  </template>
                </div>

                <!-- 【Ascend C】标准自定义算子工程 -->
                <div
                  :class="[
                    'flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]',
                    selectedProjectTypeId === 2 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : (actualTheme === 'dark' ? 'border-[#464646]' : 'border-gray-300')
                  ]"
                  @click="selectedProjectTypeId = 2"
                >
                  <div :class="[
                    'font-extrabold text-[initial] mb-3',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-800'
                  ]">
                    {{ t('web.welcome.ascendCStandardProject') }}
                  </div>
                  <div :class="[
                    'leading-7 mt-1 text-[12px] mb-2.5 whitespace-normal',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-700'
                  ]">
                    {{ t('web.welcome.ascendCStandardDesc') }}
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langAscendC') }}
                  </a-tag>
                  <a-tag color="green" class="mt-2 mr-2">
                    {{ t('web.welcome.typeStandardCustom') }}
                  </a-tag>
                  <div v-if="selectedProjectTypeId === 2" class="mt-4">
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image :src="tipBase_0"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                    </div>
                  </div>
                </div>

                <!-- 【Python】pyasc算子工程 -->
                <div
                  :class="[
                    'flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]',
                    selectedProjectTypeId === 3 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : (actualTheme === 'dark' ? 'border-[#464646]' : 'border-gray-300')
                  ]"
                  @click="selectedProjectTypeId = 3"
                >
                  <div :class="[
                    'font-extrabold text-[initial] mb-3',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-800'
                  ]">
                    {{ t('web.welcome.pythonPyascProject') }}
                  </div>
                  <div :class="[
                    'leading-7 mt-1 text-[12px] mb-2.5 whitespace-normal',
                    actualTheme === 'dark' ? 'text-white' : 'text-gray-700'
                  ]">
                    {{ t('web.welcome.pythonPyascDesc') }}
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    {{ t('web.welcome.langPython') }}
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    {{ t('web.welcome.typePyasc') }}
                  </a-tag>
                  <div v-if="selectedProjectTypeId === 3" class="mt-4">
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
          class="flex-1 box-border flex min-w-0 text-[var(--vscode-editor-foreground)]"
        >
          <!-- 左侧：算子开发文案与要点 -->
          <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
            <h3 class="text-[20px] font-semibold mb-6">
              {{ t('web.welcome.sectionDev') }}
            </h3>
            <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionDevDesc') }}
            </p>
            <ul class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold leading-[32px] max-[576px]:grid-cols-1 text-[var(--vscode-editor-foreground)]">
              <li>{{ t('web.welcome.featureTiling') }}</li>
              <li>{{ t('web.welcome.featureKernel') }}</li>
              <li>{{ t('web.welcome.featureHighlight') }}</li>
              <li>{{ t('web.welcome.featureCompletion') }}</li>
              <li>{{ t('web.welcome.featureCompileDeploy') }}</li>
            </ul>
              <!-- <a-button
              type="link"
              class="!p-0 !h-auto text-[12px]"
            >
              查看使用指南
            </a-button> -->
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

          <!-- Step 2: 算子调试 -->
          <div
            v-show="currentStep === 2"
            class="flex-1 box-border flex min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子调试文案与要点 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionDebug') }}
              </h3>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionDebugDesc') }}
              </p>
              <ul class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold leading-[32px] max-[576px]:grid-cols-1 text-[var(--vscode-editor-foreground)]">
                <li>{{ t('web.welcome.featureDebugBreakpoint') }}</li>
                <li>{{ t('web.welcome.featureDebugStep') }}</li>
                <li>{{ t('web.welcome.featureDebugMemory') }}</li>
                <li>{{ t('web.welcome.featureDebugCoreSwitch') }}</li>
                <li>{{ t('web.welcome.featureDebugInspect') }}</li>
                <li>{{ t('web.welcome.featureDebugCoredump') }}</li>
              </ul>
            </div>

            <!-- 右侧：算子调试示意图 -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-image
                :src="debug"
                class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>

          <!-- Step 3: 算子异常检测 -->
          <div
            v-show="currentStep === 3"
            class="flex-1 box-border flex min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子异常检测介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionSanitizer') }}
              </h3>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionSanitizerDesc') }}
              </p>
              <ul class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px] text-[var(--vscode-editor-foreground)]">
                <li>{{ t('web.welcome.featureMemory') }}</li>
                <li>{{ t('web.welcome.featureRace') }}</li>
                <li>{{ t('web.welcome.featureUninit') }}</li>
              </ul>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]" v-html="t('web.welcome.sanitizerSteps')" />
              <!-- <a-button
                type="link"
                class="!p-0 !h-auto text-[12px]"
              >
                查看使用指南
              </a-button> -->
            </div>

            <!-- 右侧：异常检测 2 个 Tab -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-tabs v-model:activeKey="checkTabKey">
                <a-tab-pane key="select" :tab="t('web.welcome.tabSelectCheckContent')">
                  <a-image
                    :src="selectCheckImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane key="result" :tab="t('web.welcome.tabViewCheckResult')">
                  <a-image
                    :src="checkImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>

          <!-- Step 4: 算子性能调优 -->
          <div
            v-show="currentStep === 4"
            class="flex-1 box-border flex min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子性能调优介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionPerformance') }}
              </h3>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionPerformanceDesc') }}
              </p>
              <ul class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px] text-[var(--vscode-editor-foreground)]">
                <li>{{ t('web.welcome.featureOnboard') }}</li>
                <li>{{ t('web.welcome.featureSimulation') }}</li>
              </ul>
              <p class="text-[12px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]" v-html="t('web.welcome.performanceSteps')" />
              <!-- <a-button
                type="link"
                class="!p-0 !h-auto text-[12px]"
              >
                查看使用指南
              </a-button> -->
            </div>

            <!-- 右侧：性能调优 2 个 Tab -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-tabs v-model:activeKey="perfTabKey">
                <a-tab-pane key="select" :tab="t('web.welcome.tabSelectAnalysisContent')">
                  <a-image
                    :src="selectAnalysisImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane key="result" :tab="t('web.welcome.tabViewAnalysisResult')">
                  <a-image
                    :src="analysisImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>
        </div>

        <!-- 底部步骤导航 -->
        <div
          class="w-full flex justify-center items-center gap-6 mt-4 text-[12px]"
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
            v-if="currentStep < 4"
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
import settingIconRaw from '@/assets/svg/setting.svg?raw';
import buildIconRaw from '@/assets/svg/build.svg?raw';
import checkIconRaw from '@/assets/svg/check.svg?raw';
import debugIconRaw from '@/assets/svg/debug.svg?raw';
import powerIconRaw from '@/assets/svg/power.svg?raw';
import tipBase_0 from '@/assets/imgs/add.png';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import writeImg from '@/assets/imgs/write.png';
import buildImg from '@/assets/imgs/build.gif';
import runImg from '@/assets/imgs/run.gif';
import debug from '@/assets/imgs/debug.gif';
import checkImg from '@/assets/imgs/check.gif';
import selectCheckImg from '@/assets/imgs/selectCheck.gif';
import analysisImg from '@/assets/imgs/analysis.gif';
import selectAnalysisImg from '@/assets/imgs/selectAnalysis.gif';


const { themeConfig, actualTheme } = useTheme();

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

// 新建算子工程：当前选中的工程类型（1=<<<>>> 2=标准自定义 3=pyasc），默认第一个
const selectedProjectTypeId = ref(1);

// <<<>>> 算子工程模板选择（helloworld / addn / torch_library）
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

const goPrevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value -= 1;
  }
};

const goNextStep = () => {
  if (currentStep.value < 4) {
    currentStep.value += 1;
  }
};

</script>

<style scoped>
/* Keeping complex icon backgrounds in CSS for now */
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

.welcome-link {
  color: var(--vscode-textLink-foreground);
}

.welcome-link:hover {
  color: var(--vscode-textLink-activeForeground);
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
