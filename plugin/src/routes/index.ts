import { ViewRouteRaw } from '@plugin/core/view/view-router';
import {
  VIEW_PERFORMANCE_RUN_DATA,
  VIEW_MS_SANITIZER_RUN_DATA,
  VIEW_OPS_CONFIG,
  VIEW_DUMP_TENSOR_DATA
} from '@plugin/constants';

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
  {
    path: VIEW_DUMP_TENSOR_DATA,
    title: 'DumpTensor数据-视图',
    providerViewType: 'dumpTensorSidebarView',
  },
  {
    path: VIEW_OPS_CONFIG,
    title: '算子配置',
  },
];
