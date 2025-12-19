<template>
  <a-collapse v-model:activeKey="activeKey" :bordered="false">
    <a-collapse-panel key="1" header="Welcome">
      <div style="margin-bottom: 15px;">
        <span style="color: white;">想要了解如何快速上手，详见 插件使用指南</span>
      </div>
      <!-- 方案1：普通全宽按钮（最常用） -->
      <div class="button-box">
        <a-button type="primary" @click="handleMenuClick">
          新建算子工程
        </a-button>
      </div>
      <div v-if="false" class="button-box">
        <a-button type="primary" class="button disable-btn">打开算子工程</a-button>
      </div>
    </a-collapse-panel>
  </a-collapse>

</template>
<script lang="ts" setup>
import { Ref, ref } from 'vue';
import { DownOutlined } from '@ant-design/icons-vue';

const activeKey = ref(['1']);

const handleMenuClick = () => {
  if ((window as any).vscode) {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'openLinkWebviewPanel',
      commandId: 'my-extension.openProjectView'
    });
  }
}
</script>

<style scoped lang="less">
:deep(.ant-collapse-header-text) {
  color: white;
}

:deep(.ant-collapse-expand-icon) {
  color: white;
}

.button-box {
  width: 100%;
  padding-bottom: 15px;

  .button {
    width: 100%;
  }
}

.disable-btn {
  /* 禁止状态 - 使用标准cursor值 */
  cursor: not-allowed;
  /* 禁止符号 */
  pointer-events: none;
  /* 可选：阻止点击事件 */
}

.ant-btn {
  width: 100%;
}

.top-button-framework {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 20px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
}

/* 顶部按钮容器 */
.top-buttons-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  box-sizing: border-box;
}

/* 布局方案 */
.button-layout {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.button-layout:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

/* 方案标题 */
.header {
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header::before {
  content: '🎨';
  font-size: 20px;
}

/* 按钮组基础样式 */
.button-group {
  display: flex;
  gap: 16px;
  width: 100%;
}

/* 方案1：普通全宽按钮 */
.normal-layout .button-group {
  gap: 12px;
}

.full-button {
  flex: 1;
  min-width: 0;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.full-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.full-button:active {
  transform: translateY(0);
}

/* 方案2：固定间距 */
.fixed-gap-layout .button-group {
  gap: 24px;
}

/* 方案3：图标+文字 */
.icon-text-layout .button-group {
  gap: 20px;
}

.with-icon {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 16px 20px;
  height: auto;
  min-height: 64px;
}

.button-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  margin-left: 12px;
  text-align: left;
}

.button-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-white);
}

.button-desc {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
}

/* 方案4：带状态指示 */
.status-layout .button-group {
  gap: 16px;
}

.status-button {
  position: relative;
  padding-right: 100px;
}

.status-badge {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.success {
  background: rgba(103, 194, 58, 0.2);
  color: #67c23a;
}

/* 方案5：切换按钮 */
.toggle-buttons {
  width: 100%;
}

.full-width-toggle {
  display: flex;
  width: 100%;
  gap: 1px;
  background: #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.toggle-option {
  flex: 1;
  margin: 0;
  border: none;
  border-radius: 0;
}

.toggle-option:first-child {
  border-top-left-radius: 7px;
  border-bottom-left-radius: 7px;
}

.toggle-option:last-child {
  border-top-right-radius: 7px;
  border-bottom-right-radius: 7px;
}

:deep(.el-radio-button__inner) {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
  font-size: 15px;
  border: none;
}

/* 内容区域 */
.content-area {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 40px auto 0;
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.content-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.content-header h3 {
  font-size: 20px;
  font-weight: 600;
  color: #1a202c;
  margin: 0 0 8px 0;
}

.content-header p {
  font-size: 14px;
  color: #718096;
  margin: 0;
}

.content-card {
  border: none;
  box-shadow: none;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #1a202c;
}

/* 日志样式 */
.logs-container {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 8px;
}

.logs-container::-webkit-scrollbar {
  width: 6px;
}

.logs-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.logs-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.logs-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.log-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 4px solid #dcdfe6;
  transition: all 0.2s ease;
}

.log-item:hover {
  background: #edf2f7;
  transform: translateX(2px);
}

.log-item.info {
  border-left-color: #409eff;
  background: rgba(64, 158, 255, 0.05);
}

.log-item.success {
  border-left-color: #67c23a;
  background: rgba(103, 194, 58, 0.05);
}

.log-item.warning {
  border-left-color: #e6a23c;
  background: rgba(230, 162, 60, 0.05);
}

.log-item.error {
  border-left-color: #f56c6c;
  background: rgba(245, 108, 108, 0.05);
}

.log-icon {
  font-size: 16px;
  margin-right: 12px;
  width: 20px;
  text-align: center;
}

.log-item.info .log-icon {
  color: #409eff;
}

.log-item.success .log-icon {
  color: #67c23a;
}

.log-item.warning .log-icon {
  color: #e6a23c;
}

.log-item.error .log-icon {
  color: #f56c6c;
}

.log-time {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #718096;
  min-width: 70px;
  margin-right: 16px;
}

.log-message {
  flex: 1;
  font-size: 14px;
  color: #2d3748;
}

.empty-logs {
  text-align: center;
  padding: 40px 20px;
  color: #a0aec0;
  font-size: 14px;
  background: #f8fafc;
  border-radius: 8px;
  border: 2px dashed #e2e8f0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .top-button-framework {
    padding: 12px;
  }

  .top-buttons-container {
    padding: 0 12px;
  }

  .button-group {
    flex-direction: column;
  }

  .full-button {
    width: 100%;
  }

  .with-icon {
    padding: 12px 16px;
  }

  .toggle-option {
    min-height: 48px;
  }

  .log-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .log-time {
    margin-right: 0;
  }
}

/* 加载动画 */
:deep(.el-button.is-loading) {
  position: relative;
  overflow: hidden;
}

:deep(.el-button.is-loading)::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

/* 悬停效果增强 */
.full-button:hover {
  filter: brightness(1.05);
}

.full-button:active {
  filter: brightness(0.95);
}
</style>