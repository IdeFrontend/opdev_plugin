<script setup lang="ts">
import { ref, watch } from 'vue';
import FilterBar from './components/FilterBar.vue';
import FileTree from './components/FileTree.vue';
import { getPerformanceRunData, toggleRecordMark } from '@/apis';
import { PerformanceExecutionRecord } from 'shared:/api-types';

const sortOrder = ref<'asc' | 'desc'>('desc');
const markedOnly = ref<boolean>(false);

const treeData = ref<PerformanceExecutionRecord[]>([]);

function loadTreeData() {
  const params = { sort: { by: 'timestamp' as const, order: sortOrder.value }, markedOnly: markedOnly.value };
  getPerformanceRunData(params).then((res) => {
    console.log('api-response', res);
    treeData.value = res.data;
  });
}

loadTreeData();

watch([sortOrder, markedOnly], () => {
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
    <FilterBar v-model:sort-order="sortOrder" v-model:marked-only="markedOnly" />
    <FileTree :tree-data="treeData" @toggle-mark="handleToggleMark" />
  </div>
</template>
