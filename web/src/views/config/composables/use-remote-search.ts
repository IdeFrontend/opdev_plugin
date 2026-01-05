/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ref } from 'vue';
import { remotePathSearch } from '@/apis';

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
  const remoteSearch = async (keyword: string, _tabType: string) => {
    console.log(_tabType);
    const searchValue = keyword || '';

    dataStorageLoading.value = true;
    try {
      const result = await remotePathSearch({
        type: 'dataStorage',
        keyword: buildDefaultSearchPath(searchValue.trim()),
      });
      const { type, list = [] } = result;
      const mapped = list.map((item: { path: string }) => ({
        value: item.path,
      }));

      if (type === 'dataStorage') {
        dataStorageOptions.value = mapped;
        dataStorageLoading.value = false;
      }
    } catch (error) {
      dataStorageLoading.value = false;
      console.error('远程搜索失败:', error);
    }
  };

  return {
    dataStorageOptions,
    dataStorageLoading,
    remoteSearch,
  };
}
