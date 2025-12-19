<script setup lang="ts">
import { theme } from 'ant-design-vue';
import { ref, onMounted } from 'vue';

import { getQuery } from '@/core/query';

import OpsConfig from './views/OpsConfig/OpsConfig.vue';
import PerformanceRunData from './views/PerformanceRunData/PerformanceRunData.vue';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法
};

const routePath = ref('');

// 添加错误处理和调试日志
onMounted(async () => {
  try {
    // 添加超时处理，如果 3 秒内没有收到查询参数，尝试使用 URL 参数或默认值
    const queryPromise = getQuery();
    const timeoutPromise = new Promise<{ _path: string }>((resolve) => {
      setTimeout(() => {
        console.warn('App.vue: Query timeout, checking URL params');
        // 尝试从 URL 参数获取路径
        const urlParams = new URLSearchParams(window.location.search);
        const pathFromUrl = urlParams.get('_path');
        resolve({ _path: pathFromUrl || '' });
      }, 3000);
    });
    
    const query = await Promise.race([queryPromise, timeoutPromise]);
    console.log('App.vue received query:', query);
    if (query && query._path) {
      routePath.value = query._path as string;
    } else {
      console.warn('App.vue: query._path is missing', query);
    }
  } catch (error) {
    console.error('App.vue: Failed to get query:', error);
  }
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <OpsConfig v-if="routePath === 'ops-config'"></OpsConfig>
    <PerformanceRunData v-else-if="routePath === 'performance-records'"></PerformanceRunData>
    <div v-else-if="!routePath" style="padding: 20px; color: #999;">
      加载中...
    </div>
  </a-config-provider>
</template>
