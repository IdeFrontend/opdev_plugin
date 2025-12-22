<script setup lang="ts">
import { ref, watch } from 'vue';
import FilterBar from './components/FilterBar.vue';
import FileTree from './components/FileTree.vue';
import { getPerformanceRunData } from '@/apis';
import { PerformanceRunData } from 'shared:/api-types';

const sortOrder = ref<'asc' | 'desc'>('desc');
const markedOnly = ref<boolean>(false);

const treeData = ref<PerformanceRunData[]>([]);

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
</script>

<template>
  <div @contextmenu.prevent>
    <FilterBar v-model:sort-order="sortOrder" v-model:marked-only="markedOnly" />
    <FileTree :tree-data="treeData" />
  </div>
</template>
