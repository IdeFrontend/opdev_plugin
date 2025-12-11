<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from "ant-design-vue";
import { ref, nextTick, onMounted } from "vue";
import optionsList from "./components/optionsList.vue";
import configDetail from "./components/configDetail.vue";
import { message } from "../../untils/Message";

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
const activeConfig = ref("");
const activeOption = ref("build");
const configDetailRef = ref();

const updateActiveOption = (option) => {
  activeOption.value = option;
};

const getProjectIdItem = {
  command: 'getActiveConfig',
  callback: (message) => {
    console.log('message.data activeConfig.value', message.data)
    activeConfig.value = message.data
    if (activeConfig.value) {
      nextTick(() => configDetailRef.value.init());
    }
  }
}

onMounted(() => {
  message.addMessageListener(getProjectIdItem)
  message.sendMessageToParent({ command: 'vscodeGetActiveConfig' });
})
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="config-ops">
      <optionsList :activeConfig="activeConfig" @updateActiveOption="updateActiveOption" />
      <configDetail :activeOption="activeOption" :activeConfig="activeConfig" ref="configDetailRef" />
    </div>
  </a-config-provider>
</template>

<style lang="less">
.config-ops {
  width: 100%;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
}
</style>

<style lang="less">
@import url("@/assets/less/common.less");
</style>