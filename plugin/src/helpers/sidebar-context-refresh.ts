/**
 * Lets {@link refreshSidebarContexts} in extension activation refresh both Operate and Operators trees
 * from code paths that do not have direct access to that closure (e.g. after a successful build).
 */
let refreshSidebarContextsImpl: (() => Promise<void>) | null = null;

export function registerSidebarContextsRefresh(fn: () => Promise<void>): void {
  refreshSidebarContextsImpl = fn;
}

export async function requestSidebarContextsRefresh(): Promise<void> {
  await refreshSidebarContextsImpl?.();
}
