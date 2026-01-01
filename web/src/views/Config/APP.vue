<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from 'ant-design-vue';
import { ref, nextTick, onMounted } from 'vue';
import optionsList from './components/optionsList.vue';
import configDetail from './components/configDetail.vue';
import { getConfigData } from '@/apis';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
const activeConfig = ref('');
const activeOption = ref('build');
const configDetailRef = ref();

const updateActiveOption = (option) => {
  activeOption.value = option;
};

async function loadBuildConfig() {
  const result = await getConfigData();

  console.log('getConfigData result', result);
  const obj = result || {};
  const keys = Object.keys(obj);

  activeConfig.value = keys[0] || '';
  if (activeConfig.value) {
    nextTick(() => configDetailRef.value.init(obj));
  }
}

onMounted(() => {
  loadBuildConfig();
});
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="config-ops">
      <div class="config-header">
        <div class="options-title">算子工程配置</div>
      </div>
      <div class="config-content">
        <div class="config-sidebar">
          <optionsList
            :active-config="activeConfig"
            :active-option="activeOption"
            @update-active-option="updateActiveOption"
          />
        </div>
        <div class="config-main">
          <configDetail
            ref="configDetailRef"
            :active-option="activeOption"
            :active-config="activeConfig"
          />
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
@import url('@/assets/less/common.less');
</style>
