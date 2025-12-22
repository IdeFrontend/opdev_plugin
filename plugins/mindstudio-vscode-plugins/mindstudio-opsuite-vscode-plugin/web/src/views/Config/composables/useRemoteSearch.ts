/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ref } from 'vue';
import { message } from '../../../untils/Message';

/**
 * 远程搜索 Composable
 */
export function useRemoteSearch() {
  const dataStorageOptions = ref<Array<{ value: string }>>([]);
  const dataStorageLoading = ref(false);

  /**
   * 构建默认搜索路径
   */
  const buildDefaultSearchPath = (value = '') => {
    if (value) return value;
    return '/';
  };

  /**
   * 远程搜索
   */
  const remoteSearch = (keyword: string, tabType: string) => {
    const searchValue = keyword || '';
    dataStorageLoading.value = true;
    message.sendMessageToParent({
      command: 'vscodeRemotePathSearch',
      type: 'dataStorage',
      keyword: buildDefaultSearchPath(searchValue.trim()),
    });
  };

  // 监听远程搜索结果
  message.addMessageListener({
    command: 'iframeRemoteSearchResult',
    callback: (resp) => {
      const { type, list = [] } = resp.data || {};
      const mapped = list.map((item: { path: string }) => ({ value: item.path }));
      if (type === 'dataStorage') {
        dataStorageOptions.value = mapped;
        dataStorageLoading.value = false;
      }
    },
  });

  return {
    dataStorageOptions,
    dataStorageLoading,
    remoteSearch,
  };
}
