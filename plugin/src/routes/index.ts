import { t } from 'i18next';
import { ViewRouteRaw } from '@plugin/core/view/view-router';
import {
  VIEW_DUMP_TENSOR_DATA,
} from '@plugin/constants';

export const routes: ViewRouteRaw[] = [
  // The visualization of anomaly detection results has been moved to the left side of the anomaly detection panel, and an independent side bar is no longer used.
  {
    path: VIEW_DUMP_TENSOR_DATA,
    title: t('routes.dumpTensorViewTitle'),
    providerViewType: 'dumpTensorSidebarView',
  },
];
