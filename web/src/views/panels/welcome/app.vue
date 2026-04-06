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
          <h5 class="text-[25px] font-normal m-0 mb-2.5">
            {{ t('web.welcome.welcomeTitle') }}
          </h5>
          <h1 class="text-[32px] font-semibold m-0">
            {{ t('web.welcome.platformTitle') }}
          </h1>
        </div>

        <!-- 导航步骤条（位于标题和核心功能模块之间） -->
        <div class="w-full flex justify-center mb-8 max-[992px]:mb-6">
          <a-steps
            class="welcome-steps max-w-[1200px] w-full"
            type="navigation"
            :current="currentStep"
            :items="stepItems"
            @change="onStepChange"
          />
        </div>

        <!-- 核心功能模块区域：根据步骤展示 4 个面板 -->
        <div
          class="flex items-stretch justify-center gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[300px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px] bg-[var(--vscode-editorWidget-background)] shadow-md"
          @click.stop
        >
          <!-- Step 0 / 1: 新建算子工程 -->
          <div
            v-show="currentStep === 0"
            class="flex-1 rounded-lg box-border flex flex-col min-w-0 max-[992px]:p-[15px] max-[576px]:p-3 text-[var(--vscode-editor-foreground)]"
          >
            <h3 class="text-[20px] font-semibold mb-3">
              {{ t('web.welcome.sectionNewProject') }}
            </h3>
            <p class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
              {{ t('web.welcome.sectionNewProjectDesc') }}
            </p>
            <div class="mb-6">
              <button
                class="bg-[#3d8bfd] hover:bg-[#5b9dff] text-white text-sm px-5 py-2.5 rounded-md border border-transparent transition-colors duration-150 cursor-pointer"
                @click="handleAscendCProject"
              >
                {{ t('web.welcome.createNow') }}
              </a-button>
            </div>

            <!-- 工程类型展示（3 种类型横向排列） -->
            <div class="mt-2">
              <div class="flex gap-4 max-[992px]:flex-col">
                <!-- 【Ascend C】<<<>>>算子工程 -->
                <div
                  class="flex-1 bg-transparent p-4 border border-[#464646] rounded-lg overflow-hidden relative transition-all duration-300 hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-[var(--vscode-editor-foreground)]">
                    {{ t('web.welcome.ascendCOpProject') }}
                  </div>
                  <div
                    class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal text-[var(--vscode-editor-foreground)]"
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
                  <div class="mt-4 flex flex-wrap items-center gap-3">
                    <span class="text-[13px] whitespace-nowrap text-[var(--vscode-editor-foreground)]">
                      {{ t('web.welcome.sample') }}
                    </span>
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
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image
                        :src="getTemplateImage(selectedTemplate)"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                      />
                    </div>
                  </div>
                </div>

                <!-- 【Ascend C】标准自定义算子工程 -->
                <div
                  class="flex-1 bg-transparent p-4 border border-[#464646] rounded-lg overflow-hidden relative transition-all duration-300 hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-[var(--vscode-editor-foreground)]">
                    {{ t('web.welcome.ascendCStandardProject') }}
                  </div>
                  <div class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal text-[var(--vscode-editor-foreground)]">
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
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image
                        :src="tipBase_0"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                      />
                    </div>
                  </div>
                </div>

                <!-- 【Python】pyasc算子工程 -->
                <div
                  class="flex-1 bg-transparent p-4 border border-[#464646] rounded-lg overflow-hidden relative transition-all duration-300 hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-[var(--vscode-editor-foreground)]">
                    {{ t('web.welcome.pythonPyascProject') }}
                  </div>
                  <div class="leading-7 mt-1 text-[14px] mb-2.5 whitespace-normal text-[var(--vscode-editor-foreground)]">
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
                    <div class="overflow-hidden max-w-full transition-all duration-300">
                      <a-image
                        :src="tipBase_0"
                        class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 1 / 2: 算子开发 -->
          <div
            v-show="currentStep === 1"
            class="flex-1 box-border flex max-[992px]:flex-col min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子开发文案与要点 -->
            <div class="flex-[0_0_320px] pr-8 max-[992px]:flex-[1_1_100%] max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionDev') }}
              </h3>
              <p class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionDevDesc') }}
              </p>
              <ul
                class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold leading-[32px] max-[576px]:grid-cols-1 text-[var(--vscode-editor-foreground)]"
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
            <div class="flex-1 min-w-0 max-[992px]:flex-[1_1_100%] max-[992px]:mt-6">
              <a-tabs v-model:active-key="devTabKey">
                <a-tab-pane
                  key="code"
                  :tab="t('web.welcome.tabWriteCode')"
                >
                  <a-image
                    :src="writeImg"
                    class="block w-full h-[320px] max-[992px]:h-[260px] max-[576px]:h-[200px] object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="build"
                  :tab="t('web.welcome.tabCompileDeploy')"
                >
                  <a-image
                    :src="buildImg"
                    class="block w-full h-[320px] max-[992px]:h-[260px] max-[576px]:h-[200px] object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane
                  key="run"
                  :tab="t('web.welcome.tabRun')"
                >
                  <a-image
                    :src="runImg"
                    class="block w-full h-[320px] max-[992px]:h-[260px] max-[576px]:h-[200px] object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
              </a-tabs>
            </div>
          </div>

          <!-- Step 2 / 3: 算子异常检测 -->
          <div
            v-show="currentStep === 2"
            class="flex-1 box-border flex max-[992px]:flex-col min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子异常检测介绍 -->
            <div class="flex-[0_0_320px] pr-8 max-[992px]:flex-[1_1_100%] max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionSanitizer') }}
              </h3>
              <p class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionSanitizerDesc') }}
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px] text-[var(--vscode-editor-foreground)]"
              >
                <li>{{ t('web.welcome.featureMemory') }}</li>
                <li>{{ t('web.welcome.featureRace') }}</li>
                <li>{{ t('web.welcome.featureUninit') }}</li>
              </ul>
              <p
                class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]"
                v-html="t('web.welcome.sanitizerSteps')"
              />
              <a-button
                type="link"
                class="!p-0 !h-auto text-[14px]"
              >
                {{ t('web.welcome.viewGuide') }}
              </a-button>
            </div>

            <!-- 右侧：异常检测界面示意图 -->
            <div class="flex-1 min-w-0 max-[992px]:flex-[1_1_100%] max-[992px]:mt-6">
              <a-image
                :src="checkImg"
                class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>

          <!-- Step 3 / 4: 算子性能调优 -->
          <div
            v-show="currentStep === 3"
            class="flex-1 box-border flex max-[992px]:flex-col min-w-0 text-[var(--vscode-editor-foreground)]"
          >
            <!-- 左侧：算子性能调优介绍 -->
            <div class="flex-[0_0_320px] pr-8 max-[992px]:flex-[1_1_100%] max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                {{ t('web.welcome.sectionPerformance') }}
              </h3>
              <p class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]">
                {{ t('web.welcome.sectionPerformanceDesc') }}
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold leading-[32px] text-[var(--vscode-editor-foreground)]"
              >
                <li>{{ t('web.welcome.featureOnboard') }}</li>
                <li>{{ t('web.welcome.featureSimulation') }}</li>
              </ul>
              <p
                class="text-[14px] leading-relaxed mb-6 max-[576px]:text-xs text-[var(--vscode-descriptionForeground)]"
                v-html="t('web.welcome.performanceSteps')"
              />
              <a-button
                type="link"
                class="!p-0 !h-auto text-[14px]"
              >
                {{ t('web.welcome.viewGuide') }}
              </a-button>
            </div>

            <!-- 右侧：性能调优分析界面示意图 -->
            <div class="flex-1 min-w-0 max-[992px]:flex-[1_1_100%] max-[992px]:mt-6">
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
import {
  ref, computed, h,
} from 'vue';
import { theme } from 'ant-design-vue';
import { t } from 'i18next';
import { useTheme } from '@web/composables/use-theme';
import settingIcon from '@/assets/svg/setting.svg';
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
import { useTheme } from '@web/composables/use-theme';

const {
  themeConfig, actualTheme,
} = useTheme();

const currentStep = ref(0);
const devTabKey = ref('code');

const buildSvgNode = h('svg', {
  viewBox: '0 0 16 16',
  width: '1em',
  height: '1em',
  fill: 'currentColor',
  xmlns: 'http://www.w3.org/2000/svg'
}, [
  h('path', {
    d: 'M7.26714 1.12394C7.72026 0.862332 8.27853 0.862332 8.73164 1.12394L13.5888 3.92822C14.0419 4.18983 14.3211 4.6733 14.3211 5.19652L14.3211 10.8051C14.3211 11.3283 14.0419 11.8118 13.5888 12.0734L8.73164 14.8777C8.27853 15.1393 7.72026 15.1393 7.26714 14.8777L2.40998 12.0734C1.95687 11.8118 1.67773 11.3283 1.67773 10.8051L1.67773 5.19652C1.67773 4.6733 1.95687 4.18983 2.40998 3.92822L7.26714 1.12394ZM8.22664 1.99863C8.08602 1.91744 7.91277 1.91744 7.77214 1.99863L2.91498 4.80291C2.77436 4.8841 2.68773 5.03414 2.68773 5.19652L2.68773 10.8051C2.68773 10.9675 2.77436 11.1175 2.91498 11.1987L7.77214 14.003C7.91277 14.0842 8.08602 14.0842 8.22664 14.003L13.0838 11.1987C13.2244 11.1175 13.3111 10.9675 13.3111 10.8051L13.3111 5.19652C13.3111 5.03414 13.2244 4.8841 13.0838 4.80291L8.22664 1.99863ZM10.3818 5.9086C10.5664 6.1177 10.5465 6.43683 10.3374 6.6214L8.97885 7.82068C8.83953 7.94365 8.68265 8.0357 8.51703 8.09679L8.51671 10.6008C8.51671 10.8797 8.29061 11.1058 8.01171 11.1058C7.7328 11.1058 7.50671 10.8797 7.50671 10.6008L7.50633 8.09828C7.34065 8.03771 7.1836 7.94621 7.044 7.82377L5.67633 6.62424C5.46665 6.44033 5.44575 6.12127 5.62965 5.91159C5.81356 5.70191 6.13262 5.68101 6.3423 5.86491L7.70997 7.06445C7.88188 7.21521 8.13902 7.2148 8.31044 7.06348L9.66903 5.86421C9.87812 5.67964 10.1972 5.69951 10.3818 5.9086Z',
    'fill-rule': 'evenodd',
  })
]);

const checkSvgNode = h('svg', {
  viewBox: '0 0 16 16',
  width: '1em',
  height: '1em',
  fill: 'currentColor',
  xmlns: 'http://www.w3.org/2000/svg'
}, [
  h('path', {
    d: 'M12.9497 3.05023C14.2165 4.31698 15 6.06698 15 7.99998C15 9.93298 14.2165 11.683 12.9497 12.9497L8 7.99998L12.9497 3.05023L12.9497 3.05023Z',
    opacity: '0.3',
    'fill-rule': 'evenodd',
  }),
  h('path', {
    d: 'M7.5625 14.1096L7.5625 11.4729C5.97931 11.2755 4.7245 10.0207 4.52708 8.4375L1.89038 8.4375C2.10451 11.4716 4.52845 13.8955 7.5625 14.1096ZM1.89038 7.5625L4.52708 7.5625C4.7245 5.97931 5.97931 4.7245 7.5625 4.52708L7.5625 1.89038C4.52845 2.10451 2.10451 4.52845 1.89038 7.5625ZM8.4375 1.89038L8.4375 4.52708C10.0207 4.7245 11.2755 5.97931 11.4729 7.5625L14.1096 7.5625C13.8955 4.52845 11.4716 2.10451 8.4375 1.89038ZM14.1096 8.4375L11.4729 8.4375C11.2755 10.0207 10.0207 11.2755 8.4375 11.4729L8.4375 14.1096C11.4716 13.8955 13.8955 11.4716 14.1096 8.4375ZM8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15ZM7.5625 10.5887L7.5625 8.4375L5.41129 8.4375C5.59571 9.53672 6.46328 10.4043 7.5625 10.5887ZM8.4375 10.5887C9.53672 10.4043 10.4043 9.53672 10.5887 8.4375L8.4375 8.4375L8.4375 10.5887ZM7.5625 5.41129C6.46328 5.59571 5.59571 6.46328 5.41129 7.5625L7.5625 7.5625L7.5625 5.41129ZM8.4375 5.41129L8.4375 7.5625L10.5887 7.5625C10.4043 6.46328 9.53672 5.59571 8.4375 5.41129Z',
    'fill-rule': 'evenodd',
  })
]);

const stepItems = computed(() => [
  {
    title: t('web.welcome.stepNewProject'),
    icon: h('span', {
      class: 'step-icon',
      style: {
        maskImage: `url(${settingIcon})`,
        WebkitMaskImage: `url(${settingIcon})`,
      },
    }),
  },
  {
    title: t('web.welcome.stepDev'),
    icon: h('span', {
      class: 'ant-steps-icon',
      style: { fontSize: '20px', display: 'flex', alignItems: 'center' }
    }, [buildSvgNode]),
  },
  {
    title: t('web.welcome.stepSanitizer'),
    icon: h('span', {
      class: 'ant-steps-icon',
      style: { fontSize: '20px', display: 'flex', alignItems: 'center' }
    }, [checkSvgNode]),
  },
  {
    title: t('web.welcome.stepPerformance'),
    icon: h('span', {
      class: 'step-icon',
      style: {
        maskImage: `url(${powerIcon})`,
        WebkitMaskImage: `url(${powerIcon})`,
      },
    }),
  },
]);

// <<<>>> 算子工程模板选择（helloworld / addn / torch_library）
const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template'>('helloworld');

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

/* 欢迎页导航步骤条（a-steps navigation） */
.welcome-steps .ant-steps-item-description {
  display: none;
}

.welcome-steps .ant-steps-item-icon {
  background: transparent;
}

:deep(.welcome-steps .ant-steps-item-container) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
}

:deep(.welcome-steps .ant-steps-item-icon) {
  margin-right: 8px;
}

:deep(.welcome-steps .ant-steps-item .ant-steps-item-container .ant-steps-item-content .ant-steps-item-title) {
  font-size: 18px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
  text-align: left;
  max-width: 100%;
}

:deep(.welcome-steps .ant-steps-item-content) {
  flex: 0 1 auto;
  min-width: 0;
}

:deep(.welcome-steps .ant-steps-item-icon),
:deep(.welcome-steps .ant-steps-item-content) {
  display: flex;
  align-items: center;
}

.step-icon {
  width: 22px;
  height: 22px;
  display: block;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  background-color: var(--vscode-icon-foreground, var(--vscode-foreground));
}

:deep(.welcome-steps .ant-steps-item-process .step-icon),
:deep(.welcome-steps .ant-steps-item-finish .step-icon) {
  background-color: var(--vscode-icon-foreground, var(--vscode-foreground));
}

:deep(.welcome-steps .ant-steps-item-wait .step-icon) {
  background-color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
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
