<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { useOpprofConfig } from '../composables/useOpprofConfig.ts';
import SimulationTab from './SimulationTab.vue';
import OnboardTab from './OnboardTab.vue';

const props = defineProps({
  activeConfig: {
    type: String,
    default: '',
  },
});

// 使用 composables 管理配置数据和逻辑
const {
  activeTab,
  simulationData,
  onboardData,
  updateIndex,
  handleSelectAll,
  handleMemoryAnalysisChange,
  handleOperatorPerformanceChange,
  addAdvancedParam,
  deleteAdvancedParam,
  addAdvancedSimulateParam,
  deleteAdvancedSimulateParam,
  initSimulate,
  initOnBoard,
} = useOpprofConfig();

const init = (simulateConfigData, onBoardConfigData) => {
  initSimulate(simulateConfigData);
  initOnBoard(onBoardConfigData);
};

defineExpose({ init });
</script>

<template>
  <div class="opprof-config">
    <!-- eslint-disable-next-line vue/no-v-model-argument -->
    <a-tabs v-model:active-key="activeTab">
      <!-- 仿真页签 -->
      <a-tab-pane
        key="simulation"
        tab="仿真"
      >
        <SimulationTab
          :simulation-data="simulationData"
          :update-index="updateIndex"
          @add-advanced-param="addAdvancedSimulateParam"
          @delete-advanced-param="deleteAdvancedSimulateParam"
        />
      </a-tab-pane>

      <!-- 上板页签 -->
      <a-tab-pane
        key="onboard"
        tab="上板"
      >
        <OnboardTab
          :onboard-data="onboardData"
          :update-index="updateIndex"
          @select-all="handleSelectAll"
          @memory-analysis-change="handleMemoryAnalysisChange"
          @operator-performance-change="handleOperatorPerformanceChange"
          @add-advanced-param="addAdvancedParam"
          @delete-advanced-param="deleteAdvancedParam"
        />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style lang="less" scoped>
.opprof-config {
  width: 100%;
  color: #ffffff;
  text-align: left;
  font-size: 14px;

  :deep(.ant-tabs) {
    .ant-tabs-tab {
      color: rgba(255, 255, 255, 0.65);

      &.ant-tabs-tab-active {
        .ant-tabs-tab-btn {
          color: #1668dc;
        }
      }
    }

    .ant-tabs-ink-bar {
      background: #1668dc;
    }
  }
}
</style>
