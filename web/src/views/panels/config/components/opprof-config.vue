<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import SimulationTab from './simulation-tab.vue';
import OnboardTab from './onboard-tab.vue';
import { useOpprofConfig } from '@web/views/panels/config/composables/use-opprof-config';
import { inject, computed } from 'vue';

// 从父组件注入主题状态
const actualTheme = inject('actualTheme', computed(() => 'dark'));

const props = defineProps({
  activeConfig: {
    type: String,
    default: '',
  },
});

console.log('props', props);

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
  <div class="opprof-config" :class="actualTheme === 'dark' ? 'theme-dark' : 'theme-light'">
    <!-- eslint-disable-next-line vue/no-v-model-argument -->
    <a-tabs v-model:active-key="activeTab">
      <!-- 仿真页签 -->
      <a-tab-pane
        key="simulation"
        tab="仿真"
      >
        <SimulationTab
          v-model:simulation-data="simulationData"
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
          v-model:onboard-data="onboardData"
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
  text-align: left;
  font-size: 14px;

  // 深色主题
  &.theme-dark {
    color: #ffffff;

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

  // 浅色主题
  &.theme-light {
    color: #1f1f1f;

    :deep(.ant-tabs) {
      .ant-tabs-tab {
        color: rgba(0, 0, 0, 0.65);

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
}
</style>
