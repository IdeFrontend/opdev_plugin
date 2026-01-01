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
    console.log('[query.ts] install: queryPlugin安装开始');
    // 每次 install 时（webview 重新加载），清除缓存并创建新的 Promise
    // 这样可以确保每次切换视图回来时都能收到新的查询参数
    cachedQuery = null;
    thenableQuery = createNewQueryPromise();
    console.log('[query.ts] install: 缓存已清除, 新Promise已创建');

    const queryConnector = useConnector<null, QueryParams>('viewQuery');

    console.log('[query.ts] install: queryConnector已创建');

    queryConnector.receive((query) => {
      console.log('[query.ts] install: Received query:', JSON.stringify(query));
      cachedQuery = query;

      // 如果当前有等待的 Promise，resolve 它
      if (resolveQuery) {
        console.log('[query.ts] install: resolveQuery存在, 解析Promise');
        resolveQuery(query);
        resolveQuery = null;
        // 创建新的 Promise，准备下次调用
        thenableQuery = createNewQueryPromise();
        console.log('[query.ts] install: Promise已解析, 新Promise已创建');
      } else {
        console.log('[query.ts] install: resolveQuery不存在, query已缓存');
      }
    });
    console.log('[query.ts] install: queryPlugin安装完成');
  },
};

/**
 * 获取query
 */
export function getQuery(): Promise<QueryParams> {
  console.log('[query.ts] getQuery: 调用getQuery');
  // 如果已经有缓存的查询参数，立即返回
  if (cachedQuery) {
    console.log(
      '[query.ts] getQuery: 返回缓存的query:',
      JSON.stringify(cachedQuery),
    );

    return Promise.resolve(cachedQuery);
  }
  // 否则返回 Promise，等待查询参数到达
  if (!thenableQuery) {
    console.log('[query.ts] getQuery: thenableQuery不存在, 创建新的Promise');
    thenableQuery = createNewQueryPromise();
  }
  console.log('[query.ts] getQuery: 返回Promise, 等待query到达');

  return thenableQuery;
}
