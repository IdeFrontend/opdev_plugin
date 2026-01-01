import { ApiGroup } from 'plugin:/core/ApiServer';
import { homeApis } from './home';
import { linkApis } from './link';
import { configApis } from './config';
import { projectSHApis } from './project-sh';
import { operateApis } from './operate';
import { msSanitizerPanelViewApis } from './ms-sanitizer-panel-view';
import { performanceRunDataApis } from './performance-run-data';
import { welcomeApis } from './welcome';

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
