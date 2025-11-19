<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->
 

<template>
  <a-config-provider :theme="theme">
    <router-view></router-view>
  </a-config-provider>
</template>

<script>
import { theme } from "ant-design-vue";
import { defineComponent } from "vue";

export default defineComponent({
  setup() {
    // 配置主题为暗黑模式
    const themeConfig = {
      algorithm: theme.darkAlgorithm, // 使用暗色算法[citation:1]
    };

    return {
      theme: themeConfig,
    };
  },
});
</script>
<style lang="less">
@import url("./assets/less/common.less");
</style>