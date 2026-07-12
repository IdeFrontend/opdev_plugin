/**
 * Lets {@link refreshSidebarContexts} in extension activation refresh both Operate and Operators trees
 * from code paths that do not have direct access to that closure (e.g. after a successful build).
 */
let refreshSidebarContextsImpl: (()=> Promise<void>) | null = null;

let pendingRefresh: Promise<void> | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 200;

export function registerSidebarContextsRefresh(fn: ()=> Promise<void>): void {
  refreshSidebarContextsImpl = fn;
}

export async function requestSidebarContextsRefresh(): Promise<void> {
  if (!refreshSidebarContextsImpl) {
    return;
  }

  if (pendingRefresh) {
    return pendingRefresh;
  }

  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  return new Promise((resolve) => {
    refreshTimeout = setTimeout(async () => {
      refreshTimeout = null;

      try {
        pendingRefresh = refreshSidebarContextsImpl!();
        await pendingRefresh;
      }
      finally {
        pendingRefresh = null;
        resolve();
      }
    }, DEBOUNCE_MS);
  });
}
