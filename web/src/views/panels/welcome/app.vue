<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="w-full min-h-screen bg-[#1a1a1d] text-[#f0f0f0] px-20 py-10 font-['Microsoft_Yahei',sans-serif] flex flex-col items-center relative box-border max-[992px]:px-[30px] max-[992px]:py-[20px] max-[576px]:p-[15px]"
      @click="handleClick">
      <!-- 背景层（芯片图 + 深色遮罩） -->
      <div class="absolute top-0 left-0 w-full h-full bg-cover bg-[#121417] bg-opacity-90 bg-blend-overlay z-[1]" />

      <!-- 内容层 -->
      <div
        class="relative z-[2] w-full h-full flex flex-col items-center justify-center text-white px-[50px] box-border">
        <!-- 顶部标题区域 -->
        <div class="text-center mb-8 w-full max-[992px]:mb-[20px]">
          <h5 class="text-[25px] font-normal m-0 mb-2.5">
            欢迎使用
          </h5>
          <h1 class="text-[32px] font-semibold m-0">
            OP DevTools 算子一站式开发平台
          </h1>
        </div>

        <!-- 导航步骤条（位于标题和核心功能模块之间） -->
        <div class="w-full flex justify-center mb-8 max-[992px]:mb-6">
          <a-steps class="welcome-steps max-w-[900px] w-full" type="navigation" :current="currentStep"
            @change="onStepChange">
            <a-step>
              <template #icon>
                <img :src="settingIcon" alt="新建算子工程" class="step-icon" />
              </template>
              <template #title>新建算子工程</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="buildIcon" alt="算子开发" class="step-icon" />
              </template>
              <template #title>算子开发</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="debugIcon" alt="算子调试" class="step-icon" />
              </template>
              <template #title>算子调试</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="checkIcon" alt="算子异常检测" class="step-icon" />
              </template>
              <template #title>算子异常检测</template>
            </a-step>
            <a-step>
              <template #icon>
                <img :src="powerIcon" alt="算子性能调优" class="step-icon" />
              </template>
              <template #title>算子性能调优</template>
            </a-step>
          </a-steps>
        </div>

        <!-- 核心功能模块区域：根据步骤展示 5 个面板 -->
        <div
          class="flex items-stretch justify-center bg-[#27272b] gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[300px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px]"
          @click.stop>
          <!-- Step 0 / 1: 新建算子工程 -->
          <div
            v-show="currentStep === 0"
            class="flex-1 box-border flex min-w-0 text-[#f0f0f0]"
          >
            <!-- 左侧：标题、描述、立即创建 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                新建算子工程
              </h3>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                提供您算子开发环境开箱即用能力，支持基于Ascend C、Python等算子开发，支持&lt;&lt;&lt;&gt;&gt;&gt;算子工程和标准自定义算子工程的快速创建。
              </p>
              <ul
                class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold text-[#d1d1d1] leading-[32px] max-[576px]:grid-cols-1"
              >
                <li>环境开箱即用</li>
                <li>Ascend C 算子工程</li>
                <li>Pyasc 算子工程</li>
              </ul>
              <div>
                <button
                  class="bg-[#3d8bfd] hover:bg-[#5b9dff] text-white px-5 py-2.5 rounded-md border border-transparent transition-colors duration-150 cursor-pointer"
                  @click="handleAscendCProject"
                >
                  立即创建
                </button>
              </div>
            </div>

            <!-- 右侧：工程类型（3 种类型纵向排列） -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <div class="flex flex-col gap-4">
                <!-- 【Ascend C】<<<>>>算子工程 -->
                <div
                  class="flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                  :class="selectedProjectTypeId === 1 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : 'border-[#464646]'"
                  @click="selectedProjectTypeId = 1"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-white">
                    【Ascend C】&lt;&lt;&lt;&gt;&gt;&gt;算子工程
                  </div>
                  <div class="leading-7 mt-1 text-white text-[12px] mb-2.5 whitespace-normal"
                    v-html="getTemplateDesc(selectedTemplate)" />
                  <a-tag color="blue" class="mt-2 mr-2">
                    语言：Ascend C
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    类型：&lt;&lt;&lt;&gt;&gt;&gt;
                  </a-tag>
                  <template v-if="selectedProjectTypeId === 1">
                    <div class="mt-4 flex items-center gap-3">
                      <span class="text-[13px] text-[#ffffff] whitespace-nowrap">
                        样例
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
                  class="flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                  :class="selectedProjectTypeId === 2 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : 'border-[#464646]'"
                  @click="selectedProjectTypeId = 2"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-white">
                    【Ascend C】标准自定义算子工程
                  </div>
                  <div class="leading-7 mt-1 text-white text-[12px] mb-2.5 whitespace-normal">
                    基于Ascend C语言的标准自定义算子工程，op_host存放在CPC侧的代码实现，op_kermel存放NPU侧的代码实现，op_graph存放图模式下的代码实现
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    语言：Ascend C
                  </a-tag>
                  <a-tag color="green" class="mt-2 mr-2">
                    类型：标准自定义
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
                  class="flex-1 bg-transparent p-4 border rounded-lg overflow-hidden relative transition-all duration-300 cursor-pointer hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)]"
                  :class="selectedProjectTypeId === 3 ? 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)]' : 'border-[#464646]'"
                  @click="selectedProjectTypeId = 3"
                >
                  <div class="font-extrabold text-[initial] mb-3 text-white">
                    【Python】pyasc算子工程
                  </div>
                  <div class="leading-7 mt-1 text-white text-[12px] mb-2.5 whitespace-normal">
                    基于pyasc创建自定义Add算子样例工程。
                  </div>
                  <a-tag color="blue" class="mt-2 mr-2">
                    语言：Python
                  </a-tag>
                  <a-tag color="purple" class="mt-2 mr-2">
                    类型：pyasc
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
          class="flex-1 box-border flex min-w-0 text-[#f0f0f0]"
        >
          <!-- 左侧：算子开发文案与要点 -->
          <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
            <h3 class="text-[20px] font-semibold mb-6">
              算子开发
            </h3>
            <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
              开发过程中支持Ascend C语法高亮、代码补全、代码跳转等。提供算子编译，算子部署到CANN包，算子异常检测编译，算子example编译等能力。
            </p>
            <ul
              class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold text-[#d1d1d1] leading-[32px] max-[576px]:grid-cols-1"
            >
              <li>Tiling开发</li>
              <li>Kernel开发</li>
              <li>语法高亮</li>
              <li>代码补全</li>
              <li>算子编译部署</li>
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
              <a-tab-pane key="code" tab="编写算子代码">
                <a-image
                  :src="writeImg"
                  class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                />
              </a-tab-pane>
              <a-tab-pane key="build" tab="编译部署算子">
                <a-image
                  :src="buildImg"
                  class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                />
              </a-tab-pane>
              <a-tab-pane key="run" tab="运行算子">
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
            class="flex-1 box-border flex min-w-0 text-[#f0f0f0]"
          >
            <!-- 左侧：算子调试文案与要点 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                算子调试
              </h3>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                基于msdebug工具提供NPU上板可视化调试Ascend算子工程，包括断点调试、单步执行调试、查看变量/寄存器/堆栈/断点信息、内存查询、核切和NPU coredump文件可视化调试等。
              </p>
              <ul
                class="feature-list mb-6 grid grid-cols-2 gap-y-1 list-disc list-inside text-[15px] font-semibold text-[#d1d1d1] leading-[32px] max-[576px]:grid-cols-1"
              >
                <li>断点调试</li>
                <li>单步执行调试</li>
                <li>内存查询</li>
                <li>核切</li>
                <li>查看变量/寄存器/堆栈/断点信息</li>
                <li>NPU coredump文件可视化调试</li>
              </ul>
            </div>

            <!-- 右侧：算子调试示意图 -->
            <div class="w-1/2 max-[992px]:w-full max-[992px]:mt-6">
              <a-image
                :src="runImg"
                class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
              />
            </div>
          </div>

          <!-- Step 3: 算子异常检测 -->
          <div
            v-show="currentStep === 3"
            class="flex-1 box-border flex min-w-0 text-[#f0f0f0]"
          >
            <!-- 左侧：算子异常检测介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                异常检测
              </h3>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                集成 msSanitizer 工具，提供内存检测、竞争检测和未初始化检测功能，全面覆盖算子功能正确性检测。
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold text-[#d1d1d1] leading-[32px]"
              >
                <li>内存检测</li>
                <li>竞争检测</li>
                <li>未初始化检测</li>
              </ul>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                1. 点击操作面板中的“异常检测”按钮，选择检测内容。<br />
                2. 运行完成后，点击面板中的“异常检测结果”菜单，可查看异常检测报告，支持查看详情和代码行跳转。
              </p>
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
                <a-tab-pane key="select" tab="选择检测内容">
                  <a-image
                    :src="selectCheckImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane key="result" tab="查看检测结果">
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
            class="flex-1 box-border flex min-w-0 text-[#f0f0f0]"
          >
            <!-- 左侧：算子性能调优介绍 -->
            <div class="w-1/2 pr-8 max-[992px]:w-full max-[992px]:pr-0">
              <h3 class="text-[20px] font-semibold mb-6">
                性能调优
              </h3>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                快速定位算子的软硬件性能瓶颈，提供计算内存热力图、Roofline瓶颈分析图、Cache热力图、通算流水图（MC2算子）、指令流水图、算子代码热力图、性能数据等分析能力。
              </p>
              <ul
                class="feature-list mb-6 list-disc list-inside text-[15px] font-semibold text-[#d1d1d1] leading-[32px]"
              >
                <li>上板分析</li>
                <li>仿真分析</li>
              </ul>
              <p class="text-[12px] text-[#bfbfbf] leading-relaxed mb-6 max-[576px]:text-xs">
                1. 点击操作面板中的“性能分析”按钮下的“上板分析”或“仿真分析”，选择分析内容。<br />
                2. 运行完成后，点击面板中的“性能调优结果”菜单，可查看并分析性能调优相关数据。
              </p>
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
                <a-tab-pane key="select" tab="选择分析内容">
                  <a-image
                    :src="selectAnalysisImg"
                    class="block max-w-full h-auto object-contain transition-opacity duration-300 transform"
                  />
                </a-tab-pane>
                <a-tab-pane key="result" tab="查看分析结果">
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
            class="text-[#4ba5f4] cursor-pointer hover:text-[#76b9ff] transition-colors"
            @click="goPrevStep"
          >
            上一步
          </span>
          <span
            v-if="currentStep < 4"
            class="text-[#4ba5f4] cursor-pointer hover:text-[#76b9ff] transition-colors"
            @click="goNextStep"
          >
            下一步
          </span>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { theme } from 'ant-design-vue';
import settingIcon from '@/assets/svg/setting.svg';
import buildIcon from '@/assets/svg/build.svg';
import checkIcon from '@/assets/svg/check.svg';
import debugIcon from '@/assets/svg/debug.svg';
import powerIcon from '@/assets/svg/power.svg';
import tipBase_0 from '@/assets/imgs/add.png';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import writeImg from '@/assets/imgs/write.png';
import buildImg from '@/assets/imgs/build.gif';
import runImg from '@/assets/imgs/run.gif';
import checkImg from '@/assets/imgs/check.gif';
import selectCheckImg from '@/assets/imgs/selectCheck.gif';
import analysisImg from '@/assets/imgs/analysis.gif';
import selectAnalysisImg from '@/assets/imgs/selectAnalysis.gif';


const themeConfig = {
  // 使用暗色算法[1](@ref)
  algorithm: theme.darkAlgorithm,
};

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
      return '生成&lt;&lt;&lt;&gt;&gt;&gt;异构运行的.asc代码，默认打印"Hello World"';
    case 'addn':
      return '生成&lt;&lt;&lt;&gt;&gt;&gt;异构运行的.asc，默认实现addn算子';
    case 'torch_library_template':
      return '生成&lt;&lt;&lt;&gt;&gt;&gt;接入rotch licrary的.asc代码，默认实现add算子';
    default:
      return '生成&lt;&lt;&lt;&gt;&gt;&gt;异构运行的.asc代码，默认打印"Hello World"';
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
  background-color: #38383d;
  border: none;
  border-radius: 6px;
  color: #b8b8b8;
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
  color: #ffffff;
}

.welcome-steps .ant-steps-item {
  color: #ffffff;
}

.welcome-steps .ant-steps-item::after {
  border-color: #ffffff;
}

.welcome-steps .ant-steps-item-description {
  display: none;
}

.welcome-steps .ant-steps-item-icon {
  background: transparent;
  border-color: #ffffff;
}

:deep(.welcome-steps .ant-steps-item-container) {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.welcome-steps .ant-steps-item .ant-steps-item-container .ant-steps-item-content .ant-steps-item-title) {
  font-size: 18px;
  color: #ffffff;
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

::deep(.sample-radio-group .ant-radio-wrapper) {
  color: #ffffff;
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
