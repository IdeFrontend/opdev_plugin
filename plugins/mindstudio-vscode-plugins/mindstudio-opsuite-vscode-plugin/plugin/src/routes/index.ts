import { ViewRouteRaw } from 'plugin:/core/view/ViewRouter';

export const routes: ViewRouteRaw[] = [
  { path: 'performance-records', title: '性能调优（侧边栏）', providerViewType: 'performanceSidebarView' },
  { path: 'ops-config', title: '算子配置' },
];
