import { ApiGroup } from 'plugin:/core/ApiServer';
import { homeApis } from './Home';
import { linkApis } from './Link';
import { configApis } from './Config';
import { projectSHApis } from './ProjectSH';
import { operateApis } from './Operate';
import { msSanitizerPanelViewApis } from './MsSanitizerPanelView';
import { performanceRunDataApis } from './PerformanceRunData';
import { welcomeApis } from './Welcome';

// 合并所有 webview 相关的 API 模块
export const webviewApis: ApiGroup = {
  webview: {
    ...homeApis.webview,
    ...linkApis.webview,
    ...configApis.webview,
    ...projectSHApis.webview,
    ...operateApis.webview,
    ...msSanitizerPanelViewApis.webview,
    ...performanceRunDataApis.webview,
    ...welcomeApis.webview,
  },
};
