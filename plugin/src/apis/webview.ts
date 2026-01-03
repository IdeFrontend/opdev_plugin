import { homeApis } from './home';
import { linkApis } from './link';
import { configMethods } from './config';
import { projectSHApis } from './script';
import { operateApis } from './task';
import { msSanitizerPanelViewApis } from './sanitizer-view';
import { performanceRunDataApis } from './performance-data';
import { welcomeApis } from './welcome';

// 合并所有 webview 相关的 API 方法
export const webviewMethods = {
  ...homeApis,
  ...linkApis,
  ...configMethods,
  ...projectSHApis,
  ...operateApis,
  ...msSanitizerPanelViewApis,
  ...performanceRunDataApis,
  ...welcomeApis,
};
