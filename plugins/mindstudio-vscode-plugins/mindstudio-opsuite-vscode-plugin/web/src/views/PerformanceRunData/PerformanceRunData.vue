<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FilterBar from './components/FilterBar.vue';
import FileTree from './components/FileTree.vue';
import { getPerformanceRunData, toggleRecordMark } from '@/apis';
import { PerformanceExecutionRecord } from 'shared:/api-types';

const sortOrder = ref<'asc' | 'desc'>('desc');
const markedOnly = ref<boolean>(false);

const treeData = ref<PerformanceExecutionRecord[]>([]);
const renderTreeData = computed<PerformanceExecutionRecord[]>(() => (markedOnly.value ? treeData.value.filter((item) => item.marked) : treeData.value));

function loadTreeData() {
  const params = { sort: { by: 'timestamp' as const, order: sortOrder.value } };
  getPerformanceRunData(params).then((res) => {
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
  toggleRecordMark({ key, marked });
}
</script>

<template>
  <div @contextmenu.prevent>
    <FilterBar v-model:sort-order="sortOrder" v-model:marked-only="markedOnly" @reload="loadTreeData" />
    <FileTree :tree-data="renderTreeData" @toggle-mark="handleToggleMark" />
  </div>
</template>
