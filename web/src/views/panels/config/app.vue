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
import { getConfigData, getTargetTab, getTargetOperator } from '@web/apis';
import { checkMultipleOperators } from '@web/apis/Operate';
import { useOpprofConfig } from './composables/use-opprof-config'

const themeConfig = {
  // 使用暗色算法[1](@ref)
  algorithm: theme.darkAlgorithm,
};
const activeConfig = ref('');
const activeOption = ref('build');
const configDetailRef = ref();
const operators = ref([]);
const selectedOperator = ref(null);

const updateActiveOption = (option) => {
  activeOption.value = option;
};

async function loadOperators() {
  try {
    const result = await checkMultipleOperators();
    console.log('checkMultipleOperators result', result);
    
    // 如果是标准自定义算子，使用返回的算子列表
    if (result.isStandardCustom && result.operators && result.operators.length > 0) {
      // 转换为配置页面需要的格式
      // 注意：config_name 使用实际的算子名称（不带ex），因为配置中的config_name就是算子名称本身
      // id 是 project_id，用于获取该算子的配置
      operators.value = result.operators.map((op) => ({
        id: op.id, // 这是 project_id
        op_name: op.name,
        config_name: op.name, // 配置名称就是算子名称，不带ex
        display_name: op.isExperimental ? `${op.name} (ex)` : op.name, // 显示名称带ex标识
        isExperimental: op.isExperimental,
        path: op.path, // 文件夹的完整路径
      }));
      
      // 如果有算子列表且没有选中算子,默认选择第一个
      if (!selectedOperator.value) {
        selectedOperator.value = operators.value[0].path;
      }
    } else {
      // 非标准自定义算子，没有多个算子，清空列表
      operators.value = [];
      selectedOperator.value = null;
    }
  } catch (error) {
    console.error('获取算子列表失败:', error);
    operators.value = [];
    selectedOperator.value = null;
  }
}

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

async function handleOperatorChange(value) {
  selectedOperator.value = value;
  // 找到对应的算子信息，使用 path 作为唯一标识
  const operator = operators.value.find(op => op.path === value);
  if (operator) {
    // 使用 config_name（算子名称）和 project_id 来获取配置
    await loadBuildConfig(operator.config_name, operator.id);
  } else {
    // 如果没有找到算子信息，尝试将 value 作为算子名称处理（兼容旧逻辑）
    await loadBuildConfig(value);
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

  // 先加载算子列表
  await loadOperators();
  
  // 检查是否有目标算子（从右键菜单打开时设置）
  const targetOperator = await getTargetOperator();
  if (targetOperator) {
    console.log('找到目标算子:', targetOperator);
    // 如果有目标算子，优先选择它
    // 先尝试在算子列表中找到匹配的算子
    const matchedOperator = operators.value.find(op => {
      // 匹配算子名称
      if (op.config_name === targetOperator.opName || op.op_name === targetOperator.opName) {
        return true;
      }
      // 如果指定了projectId，也匹配projectId
      if (targetOperator.projectId && op.id === targetOperator.projectId) {
        return true;
      }
      return false;
    });
    
    if (matchedOperator) {
      selectedOperator.value = matchedOperator.path;
      await loadBuildConfig(matchedOperator.config_name, matchedOperator.id);
    } else {
      // 如果没找到匹配的算子，尝试通过名称查找（兼容旧逻辑）
      const operatorByName = operators.value.find(op => op.config_name === targetOperator.opName);
      if (operatorByName) {
        selectedOperator.value = operatorByName.path;
        await loadBuildConfig(operatorByName.config_name, operatorByName.id);
      } else {
        // 如果还是找不到，使用目标算子名称（可能不在列表中）
        selectedOperator.value = targetOperator.opName;
        await loadBuildConfig(targetOperator.opName, targetOperator.projectId);
      }
    }
  } else {
    // 没有目标算子，使用默认逻辑
    // 加载配置数据（如果有选中的算子，使用算子的config_name和project_id，否则使用默认逻辑）
    if (selectedOperator.value) {
      // 先尝试通过 path 查找（新逻辑）
      let operator = operators.value.find(op => op.path === selectedOperator.value);
      // 如果找不到，尝试通过 config_name 查找（兼容旧逻辑）
      if (!operator) {
        operator = operators.value.find(op => op.config_name === selectedOperator.value);
      }
      if (operator) {
        await loadBuildConfig(operator.config_name, operator.id);
      } else {
        await loadBuildConfig(selectedOperator.value);
      }
    } else {
      await loadBuildConfig();
    }
  }
  
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
          <div v-if="operators.length > 0" class="flex items-center gap-2">
            <span class="text-white/85 text-sm">选择算子:</span>
            <a-select
              :value="selectedOperator"
              style="width: 200px"
              placeholder="请选择算子"
              @change="handleOperatorChange"
            >
              <a-select-option
                v-for="op in operators"
                :key="op.path"
                :value="op.path"
              >
                {{ op.display_name }}
              </a-select-option>
            </a-select>
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
