import { ViewRouteRaw } from '../core/view/view-router';

export const routes: ViewRouteRaw[] = [
  {
    path: 'performance-run-data',
    title: '性能调优（侧边栏）',
    providerViewType: 'performanceSidebarView',
  },
  {
    path: 'ms-sanitizer-run-data',
    title: '异常检测',
    providerViewType: 'msSanitizerSidebarView',
  },
  { path: 'ops-config', title: '算子配置' },
];
