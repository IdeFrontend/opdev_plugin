import { request } from '@/core/request';

/**
 * 导航到指定标签页
 */
export function navigateToTab(tab: string) {
  return request.post('navigation/navigateToTab', { tab });
}
