import { ViewRouteRaw } from '../core/view/view-router';

export const routes: ViewRouteRaw[] = [
  {
    path: 'performance-records',
    title: '性能调优（侧边栏）',
    providerViewType: 'performanceSidebarView',
  },
  {
    path: 'msSanitizer-data-list',
    title: '异常检测',
    providerViewType: 'msSanitizerSidebarView',
  },
  { path: 'ops-config', title: '算子配置' },
];
