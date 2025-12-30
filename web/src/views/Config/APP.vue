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
import { message } from "../../untils/Message.ts";

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
const activeConfig = ref("");
const activeOption = ref("build");
const configDetailRef = ref();

const updateActiveOption = (option) => {
  activeOption.value = option;
};

const getBuildConfigItem = {
  command: 'iframeSetBuildConfigItem',
  callback: (message) => {
    console.log('message.data config', message.data)
    const obj = JSON.parse(message.data || '{}')
    const keys = Object.keys(obj)
    activeConfig.value = keys[0] || ''
    if (activeConfig.value) {
      nextTick(() => configDetailRef.value.init(obj));
    }
  }
}

onMounted(() => {
  message.addMessageListener(getBuildConfigItem)
  message.sendMessageToParent({ command: 'vscodeGetBuildConfig' });
})
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="config-ops">
      <div class="config-header">
        <div class="options-title">
          算子工程配置
        </div>
      </div>
      <div class="config-content">
        <div class="config-sidebar">
          <optionsList :activeConfig="activeConfig" :activeOption="activeOption"
            @updateActiveOption="updateActiveOption" />
        </div>
        <div class="config-main">
          <configDetail :activeOption="activeOption" :activeConfig="activeConfig" ref="configDetailRef" />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less">
.config-ops {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-header {
  width: 100%;
  padding: 20px;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.48);
  z-index: 1;

  .options-title {
    font-size: 22px;
    font-weight: bold;
    color: #ffffff;
  }
}

.config-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  width: 100%;
}

.config-sidebar {
  width: 163px;
  min-width: 163px;
  border-right: 1px solid #424242;
  overflow: hidden;
  background-color: rgba(0, 0, 0, 0.2);
  min-height: calc(100vh - 75px);
}

.config-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

<style lang="less">
@import url("@/assets/less/common.less");
</style>