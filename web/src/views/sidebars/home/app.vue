<template>
  <a-collapse
    v-model:active-key="activeKey"
    :bordered="false"
  >
    <div style="margin-bottom: 15px" :class="textContentClass">
      <span>
        点击打开<a-button
          type="link"
          style="display: contents;"
          @click="openHelpPage"
        > 帮助指导 </a-button>或打开<a-button
          type="link"
          style="display: contents;"
          @click="openHomePage"
        > 欢迎首页 </a-button>，查看插件介绍
      </span>
    </div>
    <!-- 方案1：普通全宽按钮（最常用） -->
    <div class="w-full pb-[15px]">
      <a-button
        type="primary"
        class="w-full"
        @click="handleMenuClick"
      >
        新建算子工程
      </a-button>
    </div>
    <div
      class="w-full pb-[15px]"
    >
      <a-button
        type="primary"
        class="w-full"
        @click="handleOpenProject"
      >
        打开算子工程
      </a-button>
    </div>
  </a-collapse>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { vscode } from '@web/utils/vscode';
import { useTheme } from '@web/composables/use-theme';

const { actualTheme } = useTheme();

// 根据主题获取文本颜色类
const textContentClass = computed(() => actualTheme.value === 'dark' ? 'text-dark' : 'text-light');

const activeKey = ref(['1']);

const handleMenuClick = () => {
  vscode.postMessage({
    command: 'openLinkWebviewPanel',
    commandId: 'my-extension.openProjectView',
  });
};
const handleOpenProject = () => {
  vscode.postMessage({
    command: 'openProjectWebviewPanel',
    commandId: 'my-extension.openProjectView',
  });
};
const openHomePage = () => {
  vscode.postMessage({ command: 'openWelcome' });
};
const openHelpPage = () => {
  vscode.postMessage({
    command: 'openExternalLink',
    url: 'https://gitcode.com/org/cann/discussions/54',
  });
};
</script>

<style lang="less" scoped>
.text-dark {
  color: #ffffff;
}

.text-light {
  color: #1f1f1f;
}
</style>
