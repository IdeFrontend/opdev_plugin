import { Plugin } from 'vue';

import type { QueryParams } from 'plugin:/core/view/ViewQuery';

import { useConnector } from './use-connector';

let resolveQuery: (value: QueryParams) => void;
let thenableQuery: Promise<QueryParams> = new Promise((resolve) => {
  resolveQuery = resolve;
});

export const queryPlugin: Plugin = {
  install() {
    const queryConnector = useConnector<null, QueryParams>('viewQuery');
    queryConnector.receive((query) => {
      resolveQuery(query);
    });
  },
};

/**
 * 获取query
 */
export function getQuery(): Promise<QueryParams> {
  return thenableQuery;
}
