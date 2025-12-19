import { Plugin } from 'vue';

import type { QueryParams } from 'plugin:/core/view/ViewQuery';

import { useConnector } from './use-connector';

let resolveQuery: ((value: QueryParams) => void) | null = null;
let cachedQuery: QueryParams | null = null;
let thenableQuery: Promise<QueryParams> = new Promise((resolve) => {
  resolveQuery = resolve;
});

export const queryPlugin: Plugin = {
  install() {
    const queryConnector = useConnector<null, QueryParams>('viewQuery');
    queryConnector.receive((query) => {
      console.log('query.ts: Received query:', query);
      cachedQuery = query;
      if (resolveQuery) {
        resolveQuery(query);
        resolveQuery = null; // 只能 resolve 一次
      }
    });
  },
};

/**
 * 获取query
 */
export function getQuery(): Promise<QueryParams> {
  // 如果已经有缓存的查询参数，立即返回
  if (cachedQuery) {
    return Promise.resolve(cachedQuery);
  }
  // 否则返回 Promise，等待查询参数到达
  return thenableQuery;
}
