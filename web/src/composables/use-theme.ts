import {
  ref, computed, onBeforeMount, onUnmounted,
} from 'vue';
import { theme } from 'ant-design-vue';
import { vscode } from '@web/utils/vscode';

const LOG_PREFIX = '[useTheme]';

// 主题管理组合式函数
export function useTheme() {
  // 尝试从 body 的类名获取初始主题，并在接收到消息前作为默认值
  const getInitialTheme = (): 'light' | 'dark' => {
    return document.body.className.includes('vscode-light')
      || document.body.dataset.vscodeThemeKind === 'vscode-light'
      || document.documentElement.dataset.vscodeThemeKind === 'vscode-light'
      ? 'light'
      : 'dark';
  };

  // VSCode 主题类型（'light' 或 'dark'）
  const actualTheme = ref<'light' | 'dark'>(getInitialTheme());

  // 全局的弹出层挂载点策略
  const getPopupContainer = (_triggerNode?: HTMLElement): HTMLElement => {
    // 绑定到 document.body 以避免溢出隐藏 (overflow: hidden) 导致的弹窗截断
    return document.body;
  };

  // Ant Design Vue 主题配置
  const themeConfig = computed(() => {
    const config = {
      algorithm: actualTheme.value === 'dark'
        ? theme.darkAlgorithm
        : theme.defaultAlgorithm,
      token: { colorPrimary: actualTheme.value === 'dark' ? '#177ddc' : '#1890ff', // 根据主题调整主色调
      },
    };

    console.log(`${LOG_PREFIX} themeConfig 更新：当前主题为 '${actualTheme.value}'`, config);

    return config;
  });

  // 监听 VSCode 主题变化消息
  const handleVscodeThemeMessage = (event: MessageEvent) => {
    const data = event.data;

    if (data && typeof data === 'object' && data.command === 'updateTheme') {
      const newThemeType = data.themeName as 'light' | 'dark';

      console.log(`${LOG_PREFIX} 收到 VSCode 主题变化消息：${newThemeType}`);
      actualTheme.value = newThemeType;
    }
  };

  // 初始化主题监听
  onBeforeMount(() => {
    console.log(`${LOG_PREFIX} onBeforeMount：开始初始化`);

    // 监听 VSCode 主题变化消息
    window.addEventListener('message', handleVscodeThemeMessage);
    console.log(`${LOG_PREFIX} 已注册 VSCode 主题消息监听器`);

    // 主动请求当前主题（确保切换回页面时主题正确）
    vscode.postMessage({ command: 'getTheme' });
    console.log(`${LOG_PREFIX} onBeforeMount：已请求当前主题，actualTheme='${actualTheme.value}'`);
  });

  // 清理监听器
  onUnmounted(() => {
    console.log(`${LOG_PREFIX} onUnmounted：清理监听器`);
    window.removeEventListener('message', handleVscodeThemeMessage);
    console.log(`${LOG_PREFIX} ✓ 监听器已清理`);
  });

  return {
    actualTheme,
    themeConfig,
    getPopupContainer,
  };
}
