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
  ref, onBeforeMount, computed,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import {
  getSanitizerOptions,
  saveSanitizerOptions,
  runSanitizer,
  executeVscodeCommand,
  getSelectedOperators,
  getSanitizerShowQuickOptions,
  setSanitizerShowQuickOptions,
  getProjectEnv,
} from '@web/apis';
import type { SanitizerOptions } from '@shared/api-types';
import { getProjectType } from '@web/apis/home';
import {
  isAscendA2A3CannSoc,
  defaultSanitizerToolTypeForSoc,
  isNpuCheckProjectTypeSupported,
  type SanitizerToolType,
} from '@shared/cann-env-constants';

const { themeConfig } = useTheme();
const isExecuting = ref(false);
const isTritonProject = ref(false);
/** npu-check 仅支持 <<<>>>（Ascend C）与标准自定义算子工程；其他工程类型强制 mssanitizer。 */
const isNpuCheckProjectSupported = ref(false);
/** When true, workspace `sanitizer.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);

type DetectionScopeUi = 'global' | 'singleBlock';

const isA2A3Environment = ref(false);

const form = ref({
  toolType: 'mssanitizer' as SanitizerToolType,
  tool: {
    memcheck: true,
    npumemcheck: true,
    synccheck: true,
    racecheck: true,
    initcheck: true,
  },
  memcheckOption: {
    'check-unused-memory': true,
    'leak-check': true,
  },
  logLevel: 'warn' as 'info' | 'warn' | 'error',
  maxDebuglogSize: 1024,
  detectionScope: 'global' as DetectionScopeUi,
  blockId: undefined as number | undefined,
});

const isMsSanitizer = computed(() => form.value.toolType === 'mssanitizer');
const isNpuSanitizer = computed(() => form.value.toolType === 'npu-check');
const isNpuCheckAvailable = computed(() => !isA2A3Environment.value && isNpuCheckProjectSupported.value);
const showBlockId = computed(() => isMsSanitizer.value && form.value.detectionScope === 'singleBlock');

const blockIdModel = computed<number | undefined>({
  get: () => form.value.blockId ?? undefined,
  set: (value) => {
    form.value.blockId = clampBlockId(value);
  },
});

// mssanitizer rejects out-of-range params (--max-debuglog-size 1..10240, --block-id 0..200)
// and aborts the run, so clamp values from stored config before they reach save / run.
const MAX_DEBUGLOG_SIZE_DEFAULT = 1024;

function clampMaxDebuglogSize(value: unknown): number {
  const n = Math.trunc(Number(value));

  if (!Number.isFinite(n) || n < 1) {
    return MAX_DEBUGLOG_SIZE_DEFAULT;
  }

  return Math.min(n, 10240);
}

function isSanitizerToolType(value: unknown): value is SanitizerToolType {
  return value === 'mssanitizer' || value === 'npu-check';
}

function clampBlockId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const n = Math.trunc(Number(value));

  if (!Number.isFinite(n)) {
    return undefined;
  }

  return Math.min(Math.max(n, 0), 200);
}

async function loadSanitizerForm() {
  const options = await getSanitizerOptions();

  let socVersion: string | undefined;

  try {
    const env = await getProjectEnv();

    socVersion = env.socVersion;
  }
  catch {
    // env unavailable — defaults below handle it
  }

  isA2A3Environment.value = isAscendA2A3CannSoc(socVersion);

  // A2/A3 SOC only ships mssanitizer; npu-check supports <<<>>> and
  // standard-custom projects only — either way the persisted toolType is
  // ignored and mssanitizer is forced.
  if (!isNpuCheckAvailable.value) {
    form.value.toolType = 'mssanitizer';
  }
  else if (isSanitizerToolType(options.toolType)) {
    form.value.toolType = options.toolType;
  }
  else {
    form.value.toolType = defaultSanitizerToolTypeForSoc(socVersion);
  }

  if (options.memory !== undefined) {
    form.value.tool.memcheck = options.memory;
  }

  if (options.memCheck !== undefined) {
    form.value.tool.npumemcheck = options.memCheck;
  }

  if (options.sync !== undefined) {
    form.value.tool.synccheck = options.sync;
  }

  if (options.race !== undefined) {
    form.value.tool.racecheck = options.race;
  }

  if (options.uninitialized !== undefined) {
    form.value.tool.initcheck = options.uninitialized;
  }

  if (options.memoryLeak !== undefined) {
    form.value.memcheckOption['leak-check'] = options.memoryLeak;
  }

  if (options.allocUnused !== undefined) {
    form.value.memcheckOption['check-unused-memory'] = options.allocUnused;
  }

  if (options.reportLogLevel === 'info' || options.reportLogLevel === 'warn' || options.reportLogLevel === 'error') {
    form.value.logLevel = options.reportLogLevel;
  }

  if (options.maxSingleLogFileSize !== undefined) {
    form.value.maxDebuglogSize = clampMaxDebuglogSize(options.maxSingleLogFileSize);
  }

  if (options.detectionScope === 'global' || options.detectionScope === 'singleBlock') {
    form.value.detectionScope = options.detectionScope;
  }

  if (options.blockId !== undefined && options.blockId !== null) {
    form.value.blockId = clampBlockId(options.blockId);
  }
}

function buildSavePayload(): SanitizerOptions {
  return {
    toolType: form.value.toolType,
    memory: form.value.tool.memcheck,
    memCheck: form.value.tool.npumemcheck,
    sync: form.value.tool.synccheck,
    race: form.value.tool.racecheck,
    uninitialized: form.value.tool.initcheck,
    memoryLeak: form.value.memcheckOption['leak-check'],
    allocUnused: form.value.memcheckOption['check-unused-memory'],
    reportLogLevel: form.value.logLevel,
    maxSingleLogFileSize: clampMaxDebuglogSize(form.value.maxDebuglogSize),
    detectionScope: form.value.detectionScope,
    blockId: form.value.detectionScope === 'singleBlock' ? clampBlockId(form.value.blockId) ?? null : null,
  };
}

async function saveSanitizerForm() {
  await saveSanitizerOptions(buildSavePayload());
}

function onDetectionScopeChange() {
  if (form.value.detectionScope === 'singleBlock' && form.value.blockId === undefined) {
    form.value.blockId = 0;
  }

  saveSanitizerForm();
}

function onToolTypeChange() {
  saveSanitizerForm();
}

onBeforeMount(async () => {
  // Project type must be known before the form loads — the toolType default
  // (npu-check vs mssanitizer) depends on it.
  try {
    const project = await getProjectType();

    isTritonProject.value = project.projectType === 'triton';
    isNpuCheckProjectSupported.value = isNpuCheckProjectTypeSupported(project.projectType);
  }
  catch {
    isTritonProject.value = false;
    isNpuCheckProjectSupported.value = false;
  }

  await loadSanitizerForm();

  try {
    const showQuick = await getSanitizerShowQuickOptions();

    doNotShowAgain.value = !showQuick;
  }
  catch {
    doNotShowAgain.value = false;
  }
});

async function syncDoNotShowToWorkspace() {
  await setSanitizerShowQuickOptions(!doNotShowAgain.value);
}

const handleConfirm = async () => {
  if (!form.value || isExecuting.value) {
    return;
  }

  try {
    isExecuting.value = true;

    let operatorNames: string | undefined;

    try {
      const selectedOperators = await getSelectedOperators();

      if (selectedOperators) {
        operatorNames = selectedOperators;
      }
    }
    catch (error) {
      console.warn('获取已选择的算子失败:', error);
    }

    await saveSanitizerForm();
    runSanitizer({ operatorNames });
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('异常检测启动失败: ', error);
    message.error(t('web.options.sanitizerFailed'));
  }
  finally {
    isExecuting.value = false;
  }
};
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="sanitizer-config-page">
      <div class="page-header">
        {{ t('web.options.sanitizer.title') }}
      </div>

      <div class="sanitizer-content">
        <div class="tool-type-row">
          <span class="run-setting-label">{{ t('web.options.sanitizer.toolType') }}</span>
          <a-select
            v-model:value="form.toolType"
            style="width: 180px;"
            @change="onToolTypeChange"
          >
            <a-select-option value="mssanitizer">
              mssanitizer
            </a-select-option>
            <a-select-option
              v-if="isNpuCheckAvailable"
              value="npu-check"
            >
              npu-check
            </a-select-option>
          </a-select>
        </div>

        <template v-if="isMsSanitizer">
          <a-checkbox
            v-model:checked="form.tool.memcheck"
            @change="saveSanitizerForm"
          >
            {{ t('web.options.sanitizer.memory') }}
          </a-checkbox>
          <div
            v-if="form.tool.memcheck"
            class="mem-check"
          >
            <div class="desc">
              {{ t('web.options.sanitizer.memoryBase') }}
            </div>
            <div class="desc">
              {{ t('web.options.sanitizer.memoryExtra') }}
            </div>
            <div class="mem-option">
              <a-checkbox
                v-model:checked="form.memcheckOption['leak-check']"
                @change="saveSanitizerForm"
              >
                {{ t('web.options.sanitizer.memoryLeak') }}
              </a-checkbox>
              <a-checkbox
                v-model:checked="form.memcheckOption['check-unused-memory']"
                style="margin-left: 12px;"
                @change="saveSanitizerForm"
              >
                {{ t('web.options.sanitizer.allocUnused') }}
              </a-checkbox>
            </div>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.racecheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.race') }}
            </a-checkbox>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.initcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.uninit') }}
            </a-checkbox>
          </div>
        </template>

        <template v-if="isNpuSanitizer">
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.npumemcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuMemCheck') }}
            </a-checkbox>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.synccheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuSyncCheck') }}
            </a-checkbox>
          </div>
          <!-- npu-check 竞争检测暂未开发完毕，下个版本开放
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.racecheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuRaceCheck') }}
            </a-checkbox>
          </div>
          -->
          <!-- npu-check 未初始化检测暂未开发完毕，下个版本开放
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.initcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuInitCheck') }}
            </a-checkbox>
          </div>
          -->
        </template>

        <div
          v-if="isMsSanitizer"
          class="run-settings-section"
        >
          <div class="section-title">
            {{ t('web.options.sanitizer.runSettings') }}
          </div>
          <div class="run-setting-row">
            <span class="run-setting-label">{{ t('web.options.sanitizer.reportLogLevel') }}</span>
            <a-select
              v-model:value="form.logLevel"
              style="width: 140px;"
              @change="saveSanitizerForm"
            >
              <a-select-option value="info">
                info
              </a-select-option>
              <a-select-option value="warn">
                warn
              </a-select-option>
              <a-select-option value="error">
                error
              </a-select-option>
            </a-select>
          </div>
          <div class="run-setting-row">
            <span class="run-setting-label">{{ t('web.options.sanitizer.maxLogSize') }}</span>
            <a-input-number
              v-model:value="form.maxDebuglogSize"
              :min="1"
              :max="10240"
              style="width: 140px;"
              @change="saveSanitizerForm"
            />
          </div>
          <div class="run-setting-row">
            <span class="run-setting-label">{{ t('web.options.sanitizer.detectionScope') }}</span>
            <a-select
              v-model:value="form.detectionScope"
              style="width: 140px;"
              @change="onDetectionScopeChange"
            >
              <a-select-option value="global">
                {{ t('web.options.sanitizer.scopeGlobal') }}
              </a-select-option>
              <a-select-option value="singleBlock">
                {{ t('web.options.sanitizer.scopeSingleBlock') }}
              </a-select-option>
            </a-select>
          </div>
          <div
            v-if="showBlockId"
            class="run-setting-row"
          >
            <span class="run-setting-label">{{ t('web.options.sanitizer.blockId') }}</span>
            <a-input-number
              v-model:value="blockIdModel"
              :min="0"
              :max="200"
              style="width: 140px;"
              @change="saveSanitizerForm"
            />
          </div>
        </div>

        <div
          v-if="isTritonProject"
          class="triton-note"
        >
          {{ t('web.options.sanitizer.tritonEnvNote') }}
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
          <a-button
            type="primary"
            :loading="isExecuting"
            @click="handleConfirm"
          >
            {{ t('web.options.sanitizer.startNow') }}
          </a-button>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.sanitizer-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px solid var(--op-devtools-border);
    text-align: left;
    padding: 20px;
  }

  .sanitizer-content {
    padding: 20px;
  }

  .mem-check {
    width: fit-content;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--op-devtools-border);
    .desc {
        margin-bottom: 8px;
    }
  }

  .check-item-row {
    margin-top: 12px;
  }

  .tool-type-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .run-settings-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--op-devtools-border);
  }

  .section-title {
    font-weight: 600;
    margin-bottom: 12px;
  }

  .run-setting-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .run-setting-label {
    min-width: 160px;
  }

  .triton-note {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid var(--op-devtools-border);
    font-size: 13px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground, inherit);
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
}
</style>
