import { Plugin } from 'vue';

import type { QueryParams } from 'plugin:/core/view/ViewQuery';

import { useConnector } from './use-connector';

let resolveQuery: ((value: QueryParams) => void) | null = null;
let cachedQuery: QueryParams | null = null;
let thenableQuery: Promise<QueryParams> | null = null;

function createNewQueryPromise(): Promise<QueryParams> {
  return new Promise((resolve) => {
    resolveQuery = resolve;
  });
}

export const queryPlugin: Plugin = {
  install() {
    // 每次 install 时（webview 重新加载），清除缓存并创建新的 Promise
    // 这样可以确保每次切换视图回来时都能收到新的查询参数
    cachedQuery = null;
    thenableQuery = createNewQueryPromise();
    
    const queryConnector = useConnector<null, QueryParams>('viewQuery');
    queryConnector.receive((query) => {
      console.log('query.ts: Received query:', query);
      cachedQuery = query;
      
      // 如果当前有等待的 Promise，resolve 它
      if (resolveQuery) {
        resolveQuery(query);
        resolveQuery = null;
        // 创建新的 Promise，准备下次调用
        thenableQuery = createNewQueryPromise();
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
  if (!thenableQuery) {
    thenableQuery = createNewQueryPromise();
  }
  return thenableQuery;
}
