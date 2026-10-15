<!--
  Copyright (c) 2025 Huawei Technologies Co., Ltd.
  This program is free software, you can redistribute it and/or modify it under the terms and conditions of
  CANN Open Software License Agreement Version 2.0 (the "License").
  Please refer to the License for details. You may not use this file except in compliance with the License.
  THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
  INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
  See LICENSE in the root of the software repository for the full text of the License.
-->
<script setup lang="ts">
import {
  ref, onMounted, computed,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  getOnBoardOptions, saveOnBoardOptions, openExternalLink, startOnBoard, executeVscodeCommand, getSelectedOperators,
  getOnBoardAnalysisShowQuickOptions, setOnBoardAnalysisShowQuickOptions,
  getProjectEnv, getNpuHardwareAvailable, getOnBoardExecutionAvailable,
} from '@web/apis';
import type { OnBoardOptions } from '@shared/api-types';
import { isAscendA5ProfilerCannSoc } from '@shared/msprof-onboard-env';

// 使用主题管理组合式函数
const { themeConfig } = useTheme();
const guide = 'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';

/** Defaults mirror the on_board config row (absent keys stay unchecked otherwise). */
const DEFAULTS: OnBoardOptions = {
  interCoreLoad: true,
  roofline: true,
  operatorCodeHotspot: true,
  cacheHeatmap: true,
  pcSampling: false,
  cubeAndVectorInstructionTimeAndRatio: true,
  l2CacheHitRate: true,
  memoryReadWriteBandwidth: true,
  l0ReadWriteBandwidth: true,
  ubReadWriteBandwidth: true,
  computeAndMoveUnitTimeRatio: true,
  resourceConflictRatio: true,
};

const onboardData = ref<OnBoardOptions>({ ...DEFAULTS });
const loading = ref(false);
const isExecuting = ref(false);
/** When true, workspace `performanceTuning.onBoard.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);
const projectCannSoc = ref('');
const npuHardwareAvailable = ref(true);
const onBoardExecutionAvailable = ref(true);

const isAscendA5Profiler = computed(() => isAscendA5ProfilerCannSoc(projectCannSoc.value));

const fetchConfig = async () => {
  try {
    loading.value = true;
    const options = await getOnBoardOptions();

    Object.assign(onboardData.value, DEFAULTS, options);
  }
  catch (error) {
    console.error('获取上板配置失败: ', error);
  }
  finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  const payload: OnBoardOptions = {};

  ON_BOARD_KEYS.forEach((key) => {
    const value = onboardData.value[key];

    // operatorMetrics only enters the payload once explicitly toggled.
    if (typeof value === 'boolean') {
      payload[key] = value;
    }
  });

  await saveOnBoardOptions(payload);
};

const handleConfirm = async () => {
  if (!onboardData.value || isExecuting.value || !onBoardExecutionAvailable.value) {
    return;
  }

  try {
    isExecuting.value = true;

    // 获取已选择的算子名称（如果是标准自定义算子）
    let operatorNames;

    try {
      const selectedOperators = await getSelectedOperators();

      if (selectedOperators) {
        operatorNames = selectedOperators;
      }
    }
    catch (error) {
      console.warn('获取已选择的算子失败', error);
    }

    // 执行上板
    startOnBoard({ operatorNames });
    // 关闭当前页面
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('上板启动失败: ', error);
    message.error(t('web.options.onboardFailed'));
  }
  finally {
    isExecuting.value = false;
  }
};

const jumpToGuide = () => {
  openExternalLink(guide);
};

/** Dotted settings keys persisted by this panel (13; operatorMetrics derived from the checkbox below). */
const ON_BOARD_KEYS: readonly (keyof OnBoardOptions)[] = [
  'interCoreLoad',
  'roofline',
  'operatorCodeHotspot',
  'cacheHeatmap',
  'pcSampling',
  'cubeAndVectorInstructionTimeAndRatio',
  'l2CacheHitRate',
  'memoryReadWriteBandwidth',
  'l0ReadWriteBandwidth',
  'ubReadWriteBandwidth',
  'computeAndMoveUnitTimeRatio',
  'resourceConflictRatio',
  'operatorMetrics',
];

/** Keys under “Operator metrics”; parent checkbox must not use v-model + watch (that re-fired @change and synced every key). */
const PERFORMANCE_METRIC_KEYS = [
  'cubeAndVectorInstructionTimeAndRatio',
  'l2CacheHitRate',
  'memoryReadWriteBandwidth',
  'l0ReadWriteBandwidth',
  'ubReadWriteBandwidth',
  'computeAndMoveUnitTimeRatio',
  'resourceConflictRatio',
] as const;

const allPerformanceMetricsSelected = computed(() => PERFORMANCE_METRIC_KEYS.every((key) => Boolean(onboardData.value[key])));

const performanceMetricsIndeterminate = computed(() => {
  const count = PERFORMANCE_METRIC_KEYS.filter((key) => onboardData.value[key]).length;

  return count > 0 && count < PERFORMANCE_METRIC_KEYS.length;
});

const operatorMetricsChecked = computed(() => {
  if (typeof onboardData.value.operatorMetrics === 'boolean') {
    return onboardData.value.operatorMetrics;
  }

  return allPerformanceMetricsSelected.value;
});

const handleOperatorPerformanceChange = (e: unknown) => {
  const checked = typeof e === 'boolean'
    ? e
    : ((e as { target?: { checked?: boolean } })?.target?.checked ?? false);

  onboardData.value.operatorMetrics = checked;
  PERFORMANCE_METRIC_KEYS.forEach((key) => {
    onboardData.value[key] = checked;
  });

  handleSave();
};

async function syncDoNotShowToWorkspace() {
  await setOnBoardAnalysisShowQuickOptions(!doNotShowAgain.value);
}

onMounted(async () => {
  await fetchConfig();

  try {
    npuHardwareAvailable.value = await getNpuHardwareAvailable();
    onBoardExecutionAvailable.value = await getOnBoardExecutionAvailable();
  }
  catch {
    npuHardwareAvailable.value = true;
    onBoardExecutionAvailable.value = true;
  }

  try {
    const env = await getProjectEnv();

    projectCannSoc.value = (env?.socVersion || '').trim();
  }
  catch {
    projectCannSoc.value = '';
  }

  if (isAscendA5ProfilerCannSoc(projectCannSoc.value)) {
    onboardData.value.cacheHeatmap = false;

    if (typeof onboardData.value.pcSampling !== 'boolean') {
      onboardData.value.pcSampling = true;
    }
  }

  try {
    const showQuick = await getOnBoardAnalysisShowQuickOptions();

    doNotShowAgain.value = !showQuick;
  }
  catch {
    doNotShowAgain.value = false;
  }
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="board-config-page">
      <div class="page-header">
        {{ t('web.options.onboard.title') }}
      </div>

      <div class="board-content">
        <a-alert
          type="info"
          show-icon
          style="margin-bottom: 12px"
          class="board-alert-info-content"
        >
          <template #message>
            <div style="white-space: pre-line;">
              <div>{{ t('web.options.onboard.alert1') }}</div>
              <div>
                {{ isAscendA5Profiler
                  ? t('web.options.onboard.alert2A5')
                  : t('web.options.onboard.alert2') }}
              </div>
            </div>
          </template>
        </a-alert>
        <div class="board-title">
          {{ t('web.options.onboard.collectContent') }}
          <a-tooltip :overlay-style="{ maxWidth: '300px' }">
            <template #title>
              <div>
                {{ t('web.options.simulator.guideRef') }}
                <span
                  style="color: #1677ff; cursor: pointer;"
                  @click="jumpToGuide"
                >{{ t('web.options.guideLinkText') }}</span>
              </div>
            </template>
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          {{ t('web.options.onboard.memoryHeatmap') }}
        </div>
        <div class="compute-group">
          <div style="margin-bottom: 12px">
            {{ t('web.options.onboard.memoryHeatmapDesc') }}
          </div>

          <span>{{ t('web.options.onboard.defaultOptions') }}</span>
          <a-checkbox
            v-model:checked="onboardData.interCoreLoad"
            @change="handleSave"
          >
            {{ t('web.options.onboard.interCoreLoad') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.roofline"
            style="margin-left: 12px;"
            @change="handleSave"
          >
            {{ t('web.options.onboard.roofline') }}
          </a-checkbox>
          <a-tooltip :title="t('web.options.onboard.rooflineTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          <a-checkbox
            v-model:checked="onboardData.operatorCodeHotspot"
            @change="handleSave"
          >
            {{ t('web.options.onboard.codeHotspot') }}
          </a-checkbox>
        </div>

        <div
          v-if="!isAscendA5Profiler"
          class="cache-box"
        >
          <a-checkbox
            v-model:checked="onboardData.cacheHeatmap"
            @change="handleSave"
          >
            {{ t('web.options.onboard.cacheHeatmap') }}
          </a-checkbox>
          <a-tooltip :title="t('web.options.onboard.cacheHeatmapTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>
        <div
          v-else
          class="cache-box"
        >
          <a-checkbox
            v-model:checked="onboardData.pcSampling"
            @change="handleSave"
          >
            {{ t('web.options.onboard.pcSampling') }}
          </a-checkbox>
          <a-tooltip :title="t('web.options.onboard.pcSamplingTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div>
          <a-checkbox
            :checked="operatorMetricsChecked"
            :indeterminate="performanceMetricsIndeterminate"
            @change="handleOperatorPerformanceChange"
          >
            {{ t('web.options.onboard.operatorMetrics') }}
          </a-checkbox>
        </div>
        <div class="nested-checkbox-group">
          <a-checkbox
            v-model:checked="onboardData.cubeAndVectorInstructionTimeAndRatio"
            @change="handleSave"
          >
            {{ t('web.options.onboard.cubeVector') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.l2CacheHitRate"
            @change="handleSave"
          >
            {{ t('web.options.onboard.l2HitRate') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.memoryReadWriteBandwidth"
            @change="handleSave"
          >
            {{ t('web.options.onboard.memoryBandwidth') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.l0ReadWriteBandwidth"
            @change="handleSave"
          >
            {{ t('web.options.onboard.l0Bandwidth') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.ubReadWriteBandwidth"
            @change="handleSave"
          >
            {{ t('web.options.onboard.ubBandwidth') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.computeAndMoveUnitTimeRatio"
            @change="handleSave"
          >
            {{ t('web.options.onboard.computeMoveRatio') }}
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.resourceConflictRatio"
            @change="handleSave"
          >
            {{ t('web.options.onboard.resourceConflict') }}
          </a-checkbox>
        </div>

        <div class="do-not-show-row">
          <a-checkbox
            v-model:checked="doNotShowAgain"
            @change="syncDoNotShowToWorkspace"
          >
            {{ t('web.options.sanitizer.doNotShowAgain') }}
          </a-checkbox>
        </div>

        <div class="footer-actions">
          <p
            v-if="!onBoardExecutionAvailable"
            class="npu-unavailable-hint"
          >
            {{ t('web.operate.remoteToolRequired') }}
          </p>
          <p
            v-else-if="!npuHardwareAvailable"
            class="npu-unavailable-hint"
          >
            {{ t('web.options.onboard.remoteNpuHint') }}
          </p>
          <a-button
            type="primary"
            :loading="isExecuting"
            :disabled="!onBoardExecutionAvailable"
            @click="handleConfirm"
          >
            {{ t('web.options.onboard.startNow') }}
          </a-button>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.board-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px solid var(--op-devtools-border);
    text-align: left;
    padding: 20px;
  }

  .board-content {
    padding: 20px;
  }

  .board-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
      cursor: pointer;
    }
  }

  .compute-group {
    width: fit-content;
    max-width: 600px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--op-devtools-border);
  }

  .nested-checkbox-group {
    width: fit-content;
    max-width: 600px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--op-devtools-border);
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    .ant-checkbox-wrapper {
      display: inline-flex;
      margin-bottom: 0;
    }
  }

  .do-not-show-row {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--op-devtools-border);
  }

  .footer-actions {
    margin-top: 12px;

    .npu-unavailable-hint {
      margin-bottom: 8px;
      color: var(--vscode-disabledForeground, rgba(0, 0, 0, 0.45));
    }
  }

  .cache-box {
    display: flex;
    align-items: center;
    margin: 12px 0;
  }

  .board-alert-info-content {
    :deep(.ant-alert-icon) {
      position: relative;
      top: -10px;
    }
  }
}
</style>
