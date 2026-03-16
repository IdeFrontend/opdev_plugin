<script setup lang="ts">
import { t } from 'i18next';
import {
  computed, ref, watch, onMounted, onBeforeUnmount, provide,
} from 'vue';
import { useTheme } from '@web/composables/use-theme';
import FilterBar from './components/filter-bar.vue';
import FileTree from './components/file-tree.vue';
import {
  getPerformanceRunData, toggleRecordMark,
} from '@web/apis';
import { PerformanceExecutionRecord } from '@shared/api-types';

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();

// 向子组件提供主题状态
provide('actualTheme', actualTheme);

const sortOrder = ref<'asc' | 'desc'>('desc');
const markedOnly = ref<boolean>(false);

const treeData = ref<PerformanceExecutionRecord[]>([]);
const renderTreeData = computed<PerformanceExecutionRecord[]>(() =>
  markedOnly.value
    ? treeData.value.filter((item) => item.marked)
    : treeData.value);

function loadTreeData() {
  const params = {
    sort: {
      by: 'timestamp' as const,
      order: sortOrder.value,
    },
  };

  getPerformanceRunData(params)
    .then((res) => {
      treeData.value = res.data;
    });
}

loadTreeData();

watch(sortOrder, () => {
  loadTreeData();
});

function handleToggleMark(key: string, marked: boolean) {
  const targetRecord = treeData.value.find((item) => item.key === key);

  if (targetRecord) {
    targetRecord.marked = marked;
  }

  toggleRecordMark({
    key,
    marked,
  });
}

const eventListenerHandler = (event: MessageEvent) => {
  if (event.data.command === 'iframeRefreshData') {
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
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="flex flex-col"
      @contextmenu.prevent
    >
      <FilterBar
        v-model:sort-order="sortOrder"
        v-model:marked-only="markedOnly"
        @reload="loadTreeData"
      />
      <FileTree
        :tree-data="renderTreeData"
        @toggle-mark="handleToggleMark"
      />
      <div
        v-if="!renderTreeData || !renderTreeData.length"
        class="text-center mt-[20px]"
      >
        {{ t('web.perf.noData') }}
      </div>
    </div>
  </a-config-provider>
</template>
