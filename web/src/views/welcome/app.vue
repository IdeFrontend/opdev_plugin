<template>
  <div
    class="w-full min-h-screen bg-[#1a1a1d] text-[#f0f0f0] px-20 py-10 font-['Microsoft_Yahei',sans-serif] flex flex-col items-center relative box-border max-[992px]:px-[30px] max-[992px]:py-[20px] max-[576px]:p-[15px]"
    @click="handleClick"
  >
    <!-- 背景层（芯片图 + 深色遮罩） -->
    <div class="absolute top-0 left-0 w-full h-full bg-cover bg-[#121417] bg-opacity-90 bg-blend-overlay z-[1]"></div>

    <!-- 内容层 -->
    <div class="relative z-[2] w-full h-full flex flex-col items-center justify-center text-white px-[50px] box-border">
      <!-- 顶部标题区域 -->
      <div class="text-center mb-10 w-full max-[992px]:mb-[25px]">
        <h5 class="text-[25px] font-normal m-0 mb-2.5">欢迎使用</h5>
        <h1 class="text-[32px] font-semibold m-0">OP DevTools 算子一站式开发平台</h1>
      </div>

      <!-- 核心功能模块区域 -->
      <div class="flex items-stretch justify-center bg-[#27272b] gap-[15px] max-w-[1200px] w-full mb-[30px] py-[30px] px-[20px] flex-none rounded-xl min-h-[450px] max-[992px]:gap-3 max-[992px]:px-[15px] max-[992px]:py-[25px] max-[992px]:min-h-[400px] max-[576px]:gap-2 max-[576px]:p-[20px_10px] max-[576px]:min-h-[350px]">
        <!-- 算子工程模块 -->
        <div class="flex-1 rounded-lg p-5 box-border flex flex-col min-w-0 max-[992px]:p-[15px] max-[576px]:p-3">
          <div class="flex items-center mb-3 shrink-0 max-[576px]:mb-2.5">
            <i class="icon op-create-icon mr-3 max-[992px]:w-[26px] max-[992px]:h-[26px] max-[576px]:w-[18px] max-[576px]:h-[18px] max-[576px]:mr-2"></i>
            <h3 class="text-lg font-semibold m-0 whitespace-nowrap max-[992px]:text-base max-[576px]:text-sm">算子工程</h3>
          </div>
          <p class="text-[13px] text-[#b0b0b5] leading-normal m-0 mb-[15px] shrink-0 break-words max-[992px]:text-xs max-[576px]:text-[11px] max-[576px]:mb-3">
            提供算子开发环境开箱即用能力，支持基于Ascend
            C开发算子，支持&lt;&lt;&lt;&gt;&gt;&gt;算子工程的快速创建
          </p>
          <div
            class="grid grid-cols-2 gap-2.5 flex-1 content-start max-[992px]:grid-cols-1 max-[992px]:gap-2 max-[576px]:gap-1.5"
            @click.stop
          >
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>环境开箱即用
            </button>
            <button
              class="func-btn"
              @click="handleAscendCProject"
            >
              <i class="btn-icon"></i>Ascend C算子工程
            </button>
          </div>
        </div>

        <!-- 箭头分隔 -->
        <div class="self-center text-2xl text-[#888] shrink-0 max-[992px]:text-[20px] max-[576px]:text-base">》</div>

        <!-- 算子实现模块 -->
        <div class="flex-1 rounded-lg p-5 box-border flex flex-col min-w-0 max-[992px]:p-[15px] max-[576px]:p-3">
          <div class="flex items-center mb-3 shrink-0 max-[576px]:mb-2.5">
            <i class="icon op-impl-icon mr-3 max-[992px]:w-[28px] max-[992px]:h-[28px] max-[576px]:w-[18px] max-[576px]:h-[18px] max-[576px]:mr-2"></i>
            <h3 class="text-lg font-semibold m-0 whitespace-nowrap max-[992px]:text-base max-[576px]:text-sm">算子实现</h3>
          </div>
          <p class="text-[13px] text-[#b0b0b5] leading-normal m-0 mb-[15px] shrink-0 break-words max-[992px]:text-xs max-[576px]:text-[11px] max-[576px]:mb-3">
            开发过程中支持Ascend
            C语法高亮、代码补全、代码跳转等。提供算子编译、算子部署到CANNN包，算子异常检测编译等能力
          </p>
          <div
            class="grid grid-cols-2 gap-2.5 flex-1 content-start max-[992px]:grid-cols-1 max-[992px]:gap-2 max-[576px]:gap-1.5"
            @click.stop
          >
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>Tiling开发
            </button>
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>Kernel开发
            </button>
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>语法高亮
            </button>
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>代码补全
            </button>
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>算子编译
            </button>
          </div>
        </div>

        <!-- 箭头分隔 -->
        <div class="self-center text-2xl text-[#888] shrink-0 max-[992px]:text-[20px] max-[576px]:text-base">》</div>

        <!-- 调试调优模块 -->
        <div class="flex-1 rounded-lg p-5 box-border flex flex-col min-w-0 max-[992px]:p-[15px] max-[576px]:p-3">
          <div class="flex items-center mb-3 shrink-0 max-[576px]:mb-2.5">
            <i class="icon op-inspect-icon mr-3 max-[992px]:w-[24px] max-[992px]:h-[24px] max-[576px]:w-[18px] max-[576px]:h-[18px] max-[576px]:mr-2"></i>
            <h3 class="text-lg font-semibold m-0 whitespace-nowrap max-[992px]:text-base max-[576px]:text-sm">调试调优</h3>
          </div>
          <p class="text-[13px] text-[#b0b0b5] leading-normal m-0 mb-[15px] shrink-0 break-words max-[992px]:text-xs max-[576px]:text-[11px] max-[576px]:mb-3">
            支持NPU
            coredump文件可视化调试等能力。支持一键采集、分析算子关键性指标，提供指令流水线、内存负载分析图、Roofline瓶颈分析图、Cache热力图、算子代码热点图等能力
          </p>
          <div
            class="grid grid-cols-2 gap-2.5 flex-1 content-start max-[992px]:grid-cols-1 max-[992px]:gap-2 max-[576px]:gap-1.5"
            @click.stop
          >
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>异常检测
            </button>
            <button
              class="func-btn disabled-btn"
              @click="handleFeatureClick"
            >
              <i class="btn-icon"></i>性能调优
            </button>
          </div>
        </div>
      </div>

      <!-- 底部提示区域 -->
      <button
        class="w-full max-w-[1200px] bg-[#212124] border border-[#3a3a3e] rounded-md text-[#a0a0a5] px-6 py-4 text-base cursor-pointer transition-all duration-200 text-left flex items-center z-[1000] animate-[fadeIn_0.5s_ease-in] mx-auto hover:bg-[#2a2a2e] hover:text-[#c0c0c5] hover:border-[#4a4a4e] max-[992px]:text-center max-[992px]:justify-center max-[992px]:p-[14px_20px] max-[576px]:text-sm max-[576px]:p-[12px_16px]"
        @click.stop="handleClick"
      >
        点击左侧
        <span class="home-icon inline-block w-5 h-5 mx-2 bg-contain align-middle"></span>
        算子一站式开发平台激活左侧面板，点击面板上的 “新建算子工程”
        按钮，开始工作
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const handleClick = (event) => {
  //@ts-ignore
  if (window.vscode) {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'vscodeOpenSidebar',
      message: {},
    });
  }
};

// 处理Ascend C算子工程按钮点击
const handleAscendCProject = () => {
  //@ts-ignore
  if (window.vscode) {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'openLinkWebviewPanel',
      commandId: 'my-extension.openProjectView',
    });
  }
};

// 处理其他功能按钮点击
const handleFeatureClick = () => {
  // Create a temporary notification element
  const notification = document.createElement('div');

  notification.className = 'feature-notification';
  notification.textContent = '请打开算子工程体验';

  // Add inline styles for the notification
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#27272b',
    color: '#f0f0f0',
    padding: '12px 20px',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '9999',
    fontSize: '14px',
    fontFamily: '"Microsoft Yahei", sans-serif',
    border: '1px solid #444',
    animation: 'slideInFromRight 0.3s ease-out',
  });

  document.body.appendChild(notification);

  // Remove the notification after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
};
</script>

<style scoped>
/* Keeping complex icon backgrounds in CSS for now */
.icon {
  margin-right: 12px;
}
.op-create-icon {
  background: url('../../../../resources/welcomePage/opCreate.svg') no-repeat center;
  background-size: contain;
  width: 26px;
  height: 26px;
}
.op-impl-icon {
  background: url('../../../../resources/welcomePage/opImpl.svg') no-repeat center;
  background-size: contain;
  width: 28px;
  height: 28px;
}
.op-inspect-icon {
  background: url('../../../../resources/welcomePage/opInspect.svg') no-repeat center;
  background-size: contain;
  width: 24px;
  height: 24px;
}
.home-icon {
  background: url('../../../../resources/homeIcon.svg') no-repeat center;
  background-size: contain;
}
.btn-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  flex-shrink: 0;
  background: url('../../../resources/welcomePage/other.svg') no-repeat center;
  background-size: contain;
  vertical-align: middle;
}

/* Functional Buttons */
.func-btn {
  background-color: #38383d;
  border: none;
  border-radius: 6px;
  color: #f0f0f0;
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
.func-btn:hover {
  background-color: #4a4a50;
}
.func-btn.disabled-btn {
  background-color: #2d2d32;
  color: #7a7a80;
  cursor: not-allowed;
  opacity: 0.7;
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
  from { opacity: 0; }
  to { opacity: 1; }
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
