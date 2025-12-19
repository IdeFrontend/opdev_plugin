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
  console.log('[App.vue] onMounted: 组件已挂载, 开始获取query');
  console.log('[App.vue] onMounted: window.location:', window.location.href);
  console.log('[App.vue] onMounted: vscode对象:', typeof (window as any).vscode !== 'undefined' ? '存在' : '不存在');
  
  try {
    // 添加超时处理，如果 3 秒内没有收到查询参数，尝试使用 URL 参数或默认值
    console.log('[App.vue] onMounted: 调用getQuery');
    const queryPromise = getQuery();
    const timeoutPromise = new Promise<{ _path: string }>((resolve) => {
      setTimeout(() => {
        console.warn('[App.vue] onMounted: Query timeout (3秒), 检查URL参数');
        // 尝试从 URL 参数获取路径
        const urlParams = new URLSearchParams(window.location.search);
        const pathFromUrl = urlParams.get('_path');
        console.log('[App.vue] onMounted: URL参数中的_path:', pathFromUrl);
        resolve({ _path: pathFromUrl || '' });
      }, 3000);
    });
    
    console.log('[App.vue] onMounted: 等待query Promise或timeout');
    const query = await Promise.race([queryPromise, timeoutPromise]);
    console.log('[App.vue] onMounted: 收到query:', JSON.stringify(query));
    
    if (query && query._path) {
      console.log('[App.vue] onMounted: 设置routePath:', query._path);
      routePath.value = query._path as string;
      console.log('[App.vue] onMounted: routePath已设置:', routePath.value);
    } else {
      console.warn('[App.vue] onMounted: query._path缺失, query:', JSON.stringify(query));
    }
  } catch (error) {
    console.error('[App.vue] onMounted: 获取query失败:', error);
    console.error('[App.vue] onMounted: 错误堆栈:', error instanceof Error ? error.stack : String(error));
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
