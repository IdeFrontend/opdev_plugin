<template>
  <a-collapse
    v-model:active-key="activeKey"
    :bordered="false"
    class="[&_.ant-collapse-header-text]:!text-white [&_.ant-collapse-expand-icon]:!text-white"
  >
    <div style="margin-bottom: 15px">
      <span class="text-white">
        查看插件介绍，打开
        <a-button
          type="link"
          style="display: contents"
          @click="openHomePage"
          >欢迎首页</a-button
        >
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
      v-if="false"
      class="w-full pb-[15px]"
    >
      <a-button
        type="primary"
        class="w-full cursor-not-allowed pointer-events-none"
        >打开算子工程</a-button
      >
    </div>
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
      commandId: 'my-extension.openProjectView',
    });
  }
};
const openHomePage = () => {
  if ((window as any).vscode) {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'openWelcome',
    });
  }
};
</script>
