<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from "ant-design-vue";
import { getLocalData } from "../../untils/index";
import { ref, nextTick } from "vue";
import configList from "./components/configList.vue";
import optionsList from "./components/optionsList.vue";
import configDetail from "./components/configDetail.vue";
const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
const activeConfig = ref("");
const activeOption = ref("build");
const configArray = ref([]);
const configDetailRef = ref();
const buildConfigData = JSON.parse(localStorage.getItem("buildConfig"));
configArray.value = Object.keys(buildConfigData).map((config_name) => {
  return { config_name };
});

if (configArray.value.length > 0) {
  activeConfig.value = configArray.value[0].config_name;
  nextTick(() => configDetailRef.value.init());
}

const updateActiveOption = (option) => {
  activeOption.value = option;
};

const updateActiveConfig = (option) => {
  activeConfig.value = option.config_name;
  nextTick(() => configDetailRef.value.init());
};
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="config-ops">
      <configList
        :configArray="configArray"
        @updateActiveConfig="updateActiveConfig"
      />
      <optionsList @updateActiveOption="updateActiveOption" />
      <configDetail
        :activeOption="activeOption"
        :activeConfig="activeConfig"
        ref="configDetailRef"
      />
    </div>
  </a-config-provider>
</template>

<style lang="less">
.config-ops {
  width: 1200px;
  margin: 0 auto;
  padding-top: 50px;
  height: 100%;
}
</style>

<style lang="less">
@import url("@/assets/less/common.less");
</style>