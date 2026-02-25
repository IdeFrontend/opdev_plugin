<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, nextTick, onMounted, onUnmounted, provide } from 'vue';
import { useTheme } from '@web/composables/use-theme';
import optionsList from './components/options-list.vue';
import configDetail from './components/config-detail.vue';
import { getConfigData, getTargetTab, checkMultipleOperators, getProjectType } from '@web/apis';
import { useOpprofConfig } from './composables/use-opprof-config'

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();

// 向子组件提供主题状态，避免重复调用 useTheme
provide('actualTheme', actualTheme);
const activeConfig = ref('');
const activeOption = ref('build');
const configDetailRef = ref();
const supportsSanitizerAndTuning = ref(true);
const projectType = ref('');

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

  // 获取当前项目类型
  try {
    const result = await getProjectType();
    projectType.value = result.projectType || '';
    console.log('[config] 当前项目类型:', projectType.value);
  } catch (error) {
    console.error('[config] 获取项目类型失败:', error);
    projectType.value = '';
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
      <div class="w-full p-5 shadow-[0_2px_12px_0_rgba(0,0,0,0.48)] z-10" :class="actualTheme === 'dark' ? 'bg-[#1f1f1f]' : 'bg-white'">
        <div class="flex items-center justify-between">
          <div class="text-[22px] font-bold" :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'">
            算子工程配置
          </div>
        </div>
      </div>
      <div class="flex-1 flex overflow-hidden w-full">
        <div
          class="w-[163px] min-w-[163px]"
          :class="[actualTheme === 'dark' ? 'border-[#424242] bg-[#141414]' : 'border-[#d9d9d9] bg-gray-50']"
          style="border-right-width: 1px; overflow: hidden;"
        >
          <optionsList
            :active-config="activeConfig"
            :active-option="activeOption"
            :supports-sanitizer-and-tuning="supportsSanitizerAndTuning"
            :project-type="projectType"
            @update-active-option="updateActiveOption"
          />
        </div>
        <div class="flex-1 overflow-hidden flex flex-col">
          <configDetail
            ref="configDetailRef"
            :active-option="activeOption"
            :active-config="activeConfig"
            :project-type="projectType"
          />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
