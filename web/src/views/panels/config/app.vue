<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from 'ant-design-vue';
import {
  ref, nextTick, onMounted, onUnmounted
} from 'vue';
import optionsList from './components/options-list.vue';
import configDetail from './components/config-detail.vue';
import { getConfigData, getTargetTab, checkMultipleOperators } from '@web/apis';
import { useOpprofConfig } from './composables/use-opprof-config'

const themeConfig = {
  // 使用暗色算法[1](@ref)
  algorithm: theme.darkAlgorithm,
};
const activeConfig = ref('');
const activeOption = ref('build');
const configDetailRef = ref();
const supportsSanitizerAndTuning = ref(true);

const updateActiveOption = (option) => {
  activeOption.value = option;
};

async function loadBuildConfig(configName, projectId) {
  // 如果指定了算子名称和projectId，使用这些参数获取配置
  // 否则使用默认逻辑
  let result;
  if (configName && projectId) {
    result = await getConfigData(configName, projectId);
  } else if (configName) {
    result = await getConfigData(configName);
  } else {
    result = await getConfigData();
  }

  console.log('getConfigData result', result);
  const obj = result || {};
  const keys = Object.keys(obj);

  activeConfig.value = keys[0] || '';

  if (activeConfig.value) {
    nextTick(() => configDetailRef.value.init(obj));
  }
}

const { activeTab } = useOpprofConfig()

// 处理来自VSCode的消息
const handleWebviewMessage = (event) => {
  const message = event.data;
  console.log('message-tab', message)
  if (message.command === 'navigateToTab' && message.tab) {
    changeTab(message.tab)
  }
};

onMounted(async () => {
  // 添加message事件监听器
  window.addEventListener('message', handleWebviewMessage);

  // 检查是否支持异常检测与调优
  try {
    const result = await checkMultipleOperators();
    supportsSanitizerAndTuning.value = result.supportsSanitizerAndTuning ?? true;
    console.log('[config] 是否支持异常检测与调优:', supportsSanitizerAndTuning.value);
  } catch (error) {
    console.error('[config] 获取异常检测与调优支持状态失败:', error);
    supportsSanitizerAndTuning.value = true;
  }

  // 加载配置数据
  await loadBuildConfig();
  
  // 根据需要打开对应的菜单
  const target = await getTargetTab();
  console.log('target', target)
  if (target) {
    changeTab(target)
  }
});

const changeTab = str => {
    const tab = str.split('-')
    // 一级菜单
    activeOption.value = tab[0]
    // 二级菜单 - 性能调优
    if (tab[1]) {
      activeTab.value = tab[1]
    }
}

onUnmounted(() => {
  // 移除message事件监听器
  window.removeEventListener('message', handleWebviewMessage);
});
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="w-full h-full flex flex-col overflow-hidden">
      <div class="w-full p-5 shadow-[0_2px_12px_0_rgba(0,0,0,0.48)] z-10">
        <div class="flex items-center justify-between">
          <div class="text-[22px] font-bold text-white">
            算子工程配置
          </div>
        </div>
      </div>
      <div class="flex-1 flex overflow-hidden w-full">
        <div
          class="w-[163px] min-w-[163px] border-r border-[#424242] overflow-hidden bg-black/20 min-h-[calc(100vh-75px)]"
        >
          <optionsList
            :active-config="activeConfig"
            :active-option="activeOption"
            :supports-sanitizer-and-tuning="supportsSanitizerAndTuning"
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
