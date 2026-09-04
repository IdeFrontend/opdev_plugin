import {
  ref, onMounted, onUnmounted,
} from 'vue';
import { vscode } from '@web/utils/vscode';
import type { WebviewThemeMessage } from '@shared/webview-theme';

export function useProfilingReportTheme() {
  const theme = ref<'dark' | 'light'>('dark');

  const handleMessage = (e: MessageEvent) => {
    const message = e.data as WebviewThemeMessage;

    if (message?.command === 'updateTheme') {
      theme.value = message.isDark ? 'dark' : 'light';
    }
  };

  onMounted(() => {
    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'getTheme' });
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
  });

  return { theme };
}
