/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ref } from "vue";
import { getLocalData } from "../../../untils/index";
import { message } from "../../../untils/Message";

/**
 * 远程搜索 Composable
 */
export function useRemoteSearch() {
  const dataStorageOptions = ref<Array<{ value: string }>>([]);
  const dataStorageLoading = ref(false);
  const isRemote = ref(getLocalData("isRemote"));
  const selectedRow = ref(getLocalData("sshData")?.[0] || null);

  /**
   * 构建默认搜索路径
   */
  const buildDefaultSearchPath = (value = "") => {
    if (value) return value;
    if (selectedRow.value?.username) {
      return `/home/${selectedRow.value.username}`;
    }
    return "/";
  };

  /**
   * 远程搜索
   */
  const remoteSearch = (keyword: string, tabType: string) => {
    const searchValue = keyword || "";
    dataStorageLoading.value = true;

    // If remote, send search request
    if (isRemote.value) {
      message.sendMessageToParent({
        command: "vscodeRemotePathSearch",
        type: "dataStorage",
        keyword: buildDefaultSearchPath(searchValue.trim()),
        ssh: JSON.parse(JSON.stringify({ ...selectedRow.value })),
      });
    } else {
      // Local search logic can be added here
      dataStorageLoading.value = false;
    }
  };

  // 监听远程搜索结果
  message.addMessageListener({
    command: "iframeRemoteSearchResult",
    callback: (resp) => {
      const { type, list = [] } = resp.data || {};
      const mapped = list.map((item: { path: string }) => ({ value: item.path }));
      if (type === "dataStorage") {
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

