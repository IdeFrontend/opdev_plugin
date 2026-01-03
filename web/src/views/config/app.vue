<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from 'ant-design-vue';
import { ref, nextTick, onMounted } from 'vue';
import optionsList from './components/options-list.vue';
import configDetail from './components/config-detail.vue';
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
    <div class="w-full h-full flex flex-col overflow-hidden">
      <div class="w-full p-5 shadow-[0_2px_12px_0_rgba(0,0,0,0.48)] z-10">
        <div class="text-[22px] font-bold text-white">算子工程配置</div>
      </div>
      <div class="flex-1 flex overflow-hidden w-full">
        <div class="w-[163px] min-w-[163px] border-r border-[#424242] overflow-hidden bg-black/20 min-h-[calc(100vh-75px)]">
          <optionsList
            :active-config="activeConfig"
            :active-option="activeOption"
            @update-active-option="updateActiveOption"
          />
        </div>
        <div class="flex-1 overflow-hidden flex flex-col">
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
