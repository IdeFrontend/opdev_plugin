import { ViewRouteRaw } from '@plugin/core/view/view-router';
import {
  VIEW_OPS_CONFIG,
  VIEW_DUMP_TENSOR_DATA
} from '@plugin/constants';

export const routes: ViewRouteRaw[] = [
  // 异常检测结果可视化已迁入异常检测面板左侧，不再使用独立侧栏
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
