<script setup lang="ts">
import { theme } from 'ant-design-vue';
import { ref } from 'vue';

import { getQuery } from '@/core/query';

import OpsConfig from './views/OpsConfig/OpsConfig.vue';
import PerformanceRecords from './views/PerformanceRecords/PerformanceRecords.vue';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法
};

const routePath = ref('');
getQuery().then(({ _path }) => {
  routePath.value = _path;
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <ops-config v-if="routePath === 'ops-config'"></ops-config>
    <performance-records v-else-if="routePath === 'performance-records'"></performance-records>
  </a-config-provider>
</template>
