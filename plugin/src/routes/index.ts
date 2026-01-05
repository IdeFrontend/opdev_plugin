import { ViewRouteRaw } from '../core/view/view-router';
import {
  VIEW_PERFORMANCE_RUN_DATA,
  VIEW_MS_SANITIZER_RUN_DATA,
  VIEW_OPS_CONFIG,
} from '../constants';

export const routes: ViewRouteRaw[] = [
  {
    path: VIEW_PERFORMANCE_RUN_DATA,
    title: '性能调优（侧边栏）',
    providerViewType: 'performanceSidebarView',
  },
  {
    path: VIEW_MS_SANITIZER_RUN_DATA,
    title: '异常检测',
    providerViewType: 'msSanitizerSidebarView',
  },
  { path: VIEW_OPS_CONFIG, title: '算子配置' },
];
