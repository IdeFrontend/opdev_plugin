<script setup lang="ts">
import {
  computed, ref, watch, onMounted, onBeforeUnmount,
} from 'vue';
import FileTree from './components/file-tree.vue';
import {
  getDumpTensorData
} from '@web/apis';
import { PerformanceExecutionRecord } from '@shared/api-types';
import {
  theme,
} from 'ant-design-vue';

const treeData = ref<PerformanceExecutionRecord[]>([]);
// const renderTreeData = computed<PerformanceExecutionRecord[]>(() => treeData.value);

function loadTreeData() {
  const params = {
    sort: {
      by: 'timestamp' as const,
      order: 'desc' as const,
    },
  };

  getDumpTensorData(params)
    .then((res) => {
      treeData.value = res.data;
    });
}

loadTreeData();

const eventListenerHandler = (event: MessageEvent) => {
  console.log('[dump-tensot-data.vue]: 事件监听', event)
  
  if (event.data.command === 'dumpTensorRefreshData') {
    loadTreeData();
  }
};

// 添加全局消息监听 监听刷新列表数据
const addEventListener = () => {
  window.addEventListener('message', eventListenerHandler);
};

onMounted(() => {
  addEventListener();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', eventListenerHandler);
});

const themeConfig = {
  // 使用暗色算法
  algorithm: theme.darkAlgorithm,
};
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div
        class="flex flex-col"
        @contextmenu.prevent
    >
        <FileTree
            :tree-data="treeData"
        />
        <div
            v-if="!treeData || !treeData.length"
            class="text-center mt-[20px]"
        >
        暂无数据
        </div>
    </div>
  </a-config-provider>
</template>