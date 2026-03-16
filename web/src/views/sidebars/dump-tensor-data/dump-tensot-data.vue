<script setup lang="ts">
import {
  ref, onMounted, onBeforeUnmount,
} from 'vue';
import { t } from 'i18next';
import FileTree from './components/file-tree.vue';
import {
  getDumpTensorData,
  importDumpTensorBinFile
} from '@web/apis';
import { PerformanceExecutionRecord } from '@shared/api-types';
import { useTheme } from '@web/composables/use-theme';
import { message } from 'ant-design-vue';

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

// 监听本地事件以刷新数据
const handleRefreshTreeData = () => {
  loadTreeData();
};

// 添加全局消息监听 监听刷新列表数据
const addEventListener = () => {
  window.addEventListener('message', eventListenerHandler);
  window.addEventListener('refreshTreeData', handleRefreshTreeData);
};

onMounted(() => {
  addEventListener();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', eventListenerHandler);
  window.removeEventListener('refreshTreeData', handleRefreshTreeData);
});

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();
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
          {{ t('web.perf.noData') }}
        </div>
    </div>
  </a-config-provider>
</template>