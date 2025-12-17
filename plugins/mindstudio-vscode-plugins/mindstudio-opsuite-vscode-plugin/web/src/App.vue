<script setup lang="ts">
import { theme } from 'ant-design-vue';
import { onMounted, ref } from 'vue';

import { getQuery } from '@/core/query';

import OpsConfig from './views/OpsConfig/OpsConfig.vue';
import { request } from './core/request';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法
};

const routePath = ref('');
getQuery().then(({ _path }) => {
  routePath.value = _path;
});

onMounted(() => {
  request.post('demo-api', { projectId: 1 }).then((res) => {
    console.log('demo-api res:', res)
  }).catch();
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <ops-config v-if="routePath === 'ops-config'"></ops-config>
  </a-config-provider>
</template>
