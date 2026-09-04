<script setup lang="ts">
import {
  onMounted, onUnmounted, ref, shallowRef,
} from 'vue';
import { t } from 'i18next';
import { ProfilingReport } from '@huawei/profiling-report';

import { vscode } from '@web/utils/vscode';
import { useProfilingReportTheme } from './composables/useProfilingReportTheme';

const { theme } = useProfilingReportTheme();

const source = shallowRef<Uint8Array | null>(null);
const fileName = ref('');
const isLoading = ref(true);
const error = ref<string | null>(null);

const handleMessage = (e: MessageEvent) => {
  const message = e.data;

  if (message?.command === 'loadProfilingReportFailed' && typeof message.error === 'string') {
    source.value = null;
    error.value = message.error;
    isLoading.value = false;

    return;
  }

  if (message?.command === 'loadProfilingReport' && typeof message.uri === 'string') {
    void (async () => {
      try {
        isLoading.value = true;
        error.value = null;

        const response = await fetch(message.uri);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();

        source.value = new Uint8Array(buffer);
        fileName.value = message.fileName ?? '';
        isLoading.value = false;
      }
      catch {
        source.value = null;
        error.value = t('profilingReport.fetchFailed');
        isLoading.value = false;
      }
    })();
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  vscode.postMessage({ command: 'profilingReportReady' });
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});

const onReady = () => {
  isLoading.value = false;
};

const onError = (err: { message: string;
  cause?: unknown }) => {
  error.value = err.message;
  isLoading.value = false;
};
</script>

<template>
  <div class="profiling-report-host">
    <ProfilingReport
      v-if="source"
      :source="source"
      :theme="theme"
      :title="fileName"
      @ready="onReady"
      @error="onError"
    />
    <div
      v-else-if="error"
      class="flex flex-col items-center justify-center h-full text-sm text-red-500"
    >
      <p>{{ error }}</p>
    </div>
    <div
      v-else-if="isLoading"
      class="flex flex-col items-center justify-center h-full text-sm text-gray-500"
    >
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mb-2" />
      <p>{{ t('profilingReport.loading') }}</p>
    </div>
    <div
      v-else
      class="flex flex-col items-center justify-center h-full text-sm text-gray-500"
    >
      <p>{{ t('profilingReport.noData') }}</p>
    </div>
  </div>
</template>

<style scoped>
.profiling-report-host {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:global(body) {
  margin: 0;
  padding: 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
  overflow: hidden;
}
</style>
