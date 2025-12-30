<template>
  <div class="op-devtools-wrapper" @click="handleClick">
    <!-- 背景层（芯片图 + 深色遮罩） -->
    <div class="background-layer"></div>
    
    <!-- 内容层 -->
    <div class="content-wrapper">
      <!-- 顶部标题区域 -->
      <div class="title-section">
        <h5 class="sub-title">欢迎使用</h5>
        <h1 class="main-title">OP DevTools 算子一站式开发平台</h1>
      </div>

      <!-- 核心功能模块区域 -->
      <div class="modules-section">
        <!-- 算子工程模块 -->
        <div class="module-card">
          <div class="module-header">
            <i class="icon"></i>
            <h3>算子工程</h3>
          </div>
          <p class="module-desc">
            提供算子开发环境开箱即用能力，支持基于Ascend C开发算子，支持&lt;&lt;&lt;&gt;&gt;&gt;算子工程的快速创建
          </p>
          <div class="module-buttons" @click.stop>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>环境开箱即用</button>
            <button class="func-btn" @click="handleAscendCProject"><i class="btn-icon"></i>Ascend C算子工程</button>
            <!-- <button class="func-btn disabled-btn" disabled><i class="btn-icon"></i>Triton算子工程</button>
            <button class="func-btn disabled-btn" disabled><i class="btn-icon"></i>TileLang算子工程</button> -->
          </div>
        </div>

        <!-- 箭头分隔 -->
        <div class="arrow">》</div>

        <!-- 算子实现模块 -->
        <div class="module-card">
          <div class="module-header">
            <i class="icon"></i>
            <h3>算子实现</h3>
          </div>
          <p class="module-desc">
            开发过程中支持Ascend C语法高亮、代码补全、代码跳转等。提供算子编译、算子部署到CANNN包，算子异常检测编译等能力
          </p>
          <div class="module-buttons" @click.stop>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>Tiling开发</button>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>Kernel开发</button>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>语法高亮</button>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>代码补全</button>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>算子编译</button>
          </div>
        </div>

        <!-- 箭头分隔 -->
        <div class="arrow">》</div>

        <!-- 调试调优模块 -->
        <div class="module-card">
          <div class="module-header">
            <i class="icon"></i>
            <h3>调试调优</h3>
          </div>
          <p class="module-desc">
            支持NPU coredump文件可视化调试等能力。支持一键采集、分析算子关键性指标，提供指令流水线、内存负载分析图、Roofline瓶颈分析图、Cache热力图、算子代码热点图等能力
          </p>
          <div class="module-buttons" @click.stop>
            <!-- <button class="func-btn disabled-btn" disabled><i class="btn-icon"></i>孪生调试</button> -->
            <!-- <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>功能调试</button> -->
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>异常检测</button>
            <button class="func-btn disabled-btn" @click="handleFeatureClick"><i class="btn-icon"></i>性能调优</button>
          </div>
        </div>
      </div>

      <!-- 底部提示区域 -->
      <button class="tips-btn" @click.stop="handleClick">
        点击左侧 <span class="home-icon"></span> 算子一站式开发平台激活左侧面板，点击面板上的 “新建算子工程” 按钮，开始工作
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
      message: {}
    });
  }
}

// 处理Ascend C算子工程按钮点击
const handleAscendCProject = () => {
  //@ts-ignore
  if (window.vscode) {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'openLinkWebviewPanel',
      commandId: 'my-extension.openProjectView'
    });
  }
}

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
    animation: 'slideInFromRight 0.3s ease-out'
  });

  document.body.appendChild(notification);

  // Remove the notification after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}
</script>

<style scoped>
/* 全局容器样式 */
.op-devtools-wrapper {
  width: 100%;
  min-height: 100vh;
  background-color: #1a1a1d;
  /* 深色背景，贴近原图 */
  color: #f0f0f0;
  /* 基础文字颜色 */
  padding: 40px 80px;
  box-sizing: border-box;
  font-family: "Microsoft Yahei", sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 整体内容居中 */
  position: relative;
  /* 为绝对定位的提示元素提供定位上下文 */
}

/* 背景层：芯片图片 + 深色半透明遮罩 */
.background-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* background: url("../../../../resources/welcomePage/background.png") no-repeat center center; */
  background-size: cover;
  /* 深色遮罩，保证文字清晰 */
  background-color: rgba(18, 20, 23, 0.9);
  background-blend-mode: overlay;
  z-index: 1;
}

/* 内容层：相对定位，覆盖背景层 */
.content-wrapper {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  padding: 0 50px;
  box-sizing: border-box;
}

/* 标题区域 */
.title-section {
  text-align: center;
  margin-bottom: 40px;
  width: 100%;
}

.sub-title {
  font-size: 25px;
  font-weight: 400;
  margin: 0 0 10px 0;
}

.main-title {
  font-size: 32px;
  font-weight: 600;
  margin: 0;
}

/* 模块区域布局 */
.modules-section {
  display: flex;
  align-items: stretch;
  justify-content: center;
  background-color: #27272b;
  gap: 15px;
  /* 缩小卡片间距 */
  max-width: 1200px;
  /* 缩小最大宽度 */
  width: 100%;
  margin-bottom: 30px;
  padding: 30px 20px;
  /* 增加垂直内边距，减少水平内边距 */
  flex: none;
  border-radius: 12px;
  min-height: 450px;
  /* 增加最小高度以适应内容 */
}

/* 箭头样式 */
.arrow {
  align-self: center;
  font-size: 24px;
  color: #888;
  flex-shrink: 0;
}

/* 单个模块卡片 */
.module-card {
  flex: 1;
  border-radius: 8px;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* 使内部元素纵向排列 */
  min-width: 0;
  /* 允许卡片缩小 */
}

.module-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
  /* 不允许标题区域缩小 */
}

.module-header .icon {
  margin-right: 12px;
  /* 减少右边距 */
}

.module-card:nth-child(1) .module-header .icon {
  background: url("../../../../resources/welcomePage/opCreate.svg") no-repeat center;
  background-size: contain;
  width: 26px;
  height: 26px;
}

.module-card:nth-child(3) .module-header .icon {
  background: url("../../../../resources/welcomePage/opImpl.svg") no-repeat center;
  background-size: contain;
  width: 28px;
  height: 28px;
}

.module-card:nth-child(5) .module-header .icon {
  background: url("../../../../resources/welcomePage/opInspect.svg") no-repeat center;
  background-size: contain;
  width: 24px;
  height: 24px;
}

.module-header h3 {
  font-size: 18px;
  /* 缩小标题字体 */
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  /* 标题不换行 */
}

.module-desc {
  font-size: 13px;
  /* 缩小描述字体 */
  color: #b0b0b5;
  line-height: 1.5;
  margin: 0 0 15px 0;
  flex-shrink: 0;
  /* 描述文字不缩小 */
  overflow-wrap: break-word;
  /* 允许长单词换行 */
}

/* 功能按钮 */
.module-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  /* 保持两列布局 */
  gap: 10px;
  flex: 1;
  /* 占据剩余空间 */
  align-content: start;
  /* 按钮从顶部开始排列 */
}

.func-btn {
  background-color: #38383d;
  border: none;
  border-radius: 6px;
  color: #f0f0f0;
  padding: 10px 12px;
  /* 减少按钮内边距 */
  font-size: 13px;
  /* 缩小按钮字体 */
  cursor: pointer;
  transition: background-color 0.2s;
  min-height: 36px;
  /* 最小高度，允许增长 */
  height: auto;
  /* 高度自适应内容 */
  text-align: left;
  display: flex;
  align-items: center;
  word-break: break-word;
  /* 允许文字换行 */
  overflow-wrap: break-word;
  /* 允许长单词换行 */
  line-height: 1.4;
  /* 设置行高 */
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

.btn-icon {
  display: inline-block;
  width: 14px;
  /* 减小图标 */
  height: 14px;
  margin-right: 6px;
  /* 减少右边距 */
  flex-shrink: 0;
  /* 图标不缩小 */
  background: url("../../../resources/welcomePage/other.svg") no-repeat center;
  background-size: contain;
  vertical-align: middle;
}

.tips-btn {
  width: 100%;
  max-width: 1200px;
  /* 与 modules-section 宽度一致 */
  background-color: #212124;
  border: 1px solid #3a3a3e;
  border-radius: 6px;
  color: #a0a0a5;
  padding: 16px 24px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  display: flex;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.5s ease-in;
  margin: 0 auto;
}

.tips-btn:hover {
  background-color: #2a2a2e;
  color: #c0c0c5;
  border-color: #4a4a4e;
}

.home-icon {
  display: inline-block;
  width: 20px;
  /* Increase icon size */
  height: 20px;
  margin-left: 8px;
  margin-right: 8px;
  background: url("../../../../resources/homeIcon.svg") no-repeat center;
  background-size: contain;
  vertical-align: middle;
}

/* 响应式适配 */
@media (max-width: 992px) {
  .op-devtools-wrapper {
    padding: 20px 30px;
    /* Reduce padding on smaller screens */
  }

  .title-section {
    margin-bottom: 25px;
  }

  .modules-section {
    gap: 12px;
    /* 进一步缩小间距 */
    padding: 25px 15px;
    /* 减少水平内边距 */
    min-height: 400px;
  }

  .arrow {
    font-size: 20px;
    /* 缩小箭头 */
  }

  .module-card {
    padding: 15px;
    /* Adjust padding for smaller screens */
  }

  .module-header h3 {
    font-size: 16px;
  }

  .module-desc {
    font-size: 12px;
  }

  .module-buttons {
    grid-template-columns: 1fr;
    /* 改为单列布局 */
    gap: 8px;
  }

  .func-btn {
    font-size: 12px;
    padding: 8px 10px;
    min-height: 32px;
    height: auto;
    /* 允许高度自适应 */
  }

  .tips-btn {
    text-align: center;
    /* 移动端改为居中 */
    padding: 14px 20px;
    /* Adjust padding for mobile */
  }
}

/* Extra small screens */
@media (max-width: 576px) {
  .op-devtools-wrapper {
    padding: 15px 15px;
    /* Further reduce padding on very small screens */
  }

  .modules-section {
    gap: 8px;
    /* 进一步缩小间距 */
    padding: 20px 10px;
    /* Adjust padding for very small screens */
    min-height: 350px;
  }

  .arrow {
    font-size: 16px;
  }

  .module-card {
    padding: 12px;
    /* Adjust padding for very small screens */
  }

  .module-header {
    margin-bottom: 10px;
  }

  .module-header .icon {
    width: 18px;
    height: 18px;
    margin-right: 8px;
  }

  .module-header h3 {
    font-size: 14px;
  }

  .module-desc {
    font-size: 11px;
    margin: 0 0 12px 0;
  }

  .module-buttons {
    grid-template-columns: 1fr;
    /* 单列布局 */
    gap: 6px;
    /* Adjust gap for very small screens */
  }

  .func-btn {
    padding: 6px 8px;
    font-size: 11px;
    min-height: 28px;
    height: auto;
    /* 允许高度自适应 */
  }

  .btn-icon {
    width: 12px;
    height: 12px;
    margin-right: 4px;
  }

  .tips-btn {
    font-size: 14px;
    padding: 12px 16px;
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes pointLeft {
  0% {
    transform: scaleX(-1) translateY(0);
  }

  50% {
    transform: scaleX(-1) translateY(-5px);
  }

  100% {
    transform: scaleX(-1) translateY(0);
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

@keyframes slideIn {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }

  to {
    transform: translateX(0);
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
}</style>