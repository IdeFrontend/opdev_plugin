<script setup lang="ts">
import {
  ref, onBeforeMount, computed,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import {
  getSanitizerConfigs,
  saveSanitizerForm as saveSanitizerFormAPI,
  runSanitizer,
  executeVscodeCommand,
  getSelectedOperators,
  getSanitizerShowQuickOptions,
  setSanitizerShowQuickOptions,
  getProjectEnv,
} from '@web/apis';
import { getProjectType } from '@web/apis/home';
import {
  isAscendA2A3CannSoc,
  defaultSanitizerToolTypeForSoc,
  type SanitizerToolType,
} from '@shared/cann-env-constants';

const { themeConfig } = useTheme();
const isExecuting = ref(false);
const isTritonProject = ref(false);
/** When true, workspace `sanitizer.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);

type DetectionScopeUi = 'global' | 'singleBlock';

const isA2A3Environment = ref(false);

const form = ref({
  toolType: 'mssanitizer' as SanitizerToolType,
  tool: {
    memcheck: true,
    synccheck: true,
    racecheck: true,
    initcheck: true,
    soccheck: true,
    overcheck: true,
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
const isNpuSanitizer = computed(() => form.value.toolType === 'npu-sanitizer');
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
  return value === 'mssanitizer' || value === 'npu-sanitizer';
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
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};

  let socVersion: string | undefined;

  try {
    const env = await getProjectEnv();

    socVersion = env.socVersion;
  }
  catch {
    // env unavailable — defaults below handle it
  }

  isA2A3Environment.value = isAscendA2A3CannSoc(socVersion);

  if (isA2A3Environment.value) {
    form.value.toolType = 'mssanitizer';
  }
  else if (isSanitizerToolType(obj.toolType)) {
    form.value.toolType = obj.toolType;
  }
  else {
    form.value.toolType = defaultSanitizerToolTypeForSoc(socVersion);
  }

  Object.keys(form.value.tool)
    .forEach((key) => {
      const tool = obj.tool as Record<string, boolean> | undefined;

      if (tool && tool[key] !== undefined) {
        form.value.tool[key as keyof typeof form.value.tool] = Boolean(tool[key]);
      }
    });

  Object.keys(form.value.memcheckOption)
    .forEach((key) => {
      const mem = obj.memcheckOption as Record<string, boolean> | undefined;

      if (mem && mem[key] !== undefined) {
        form.value.memcheckOption[key as keyof typeof form.value.memcheckOption] = Boolean(mem[key]);
      }
    });

  if (obj.logLevel === 'info' || obj.logLevel === 'warn' || obj.logLevel === 'error') {
    form.value.logLevel = obj.logLevel;
  }

  if (obj.maxDebuglogSize !== undefined) {
    form.value.maxDebuglogSize = clampMaxDebuglogSize(obj.maxDebuglogSize);
  }

  if (obj.useBlock === true) {
    form.value.detectionScope = 'singleBlock';
  }
  else {
    form.value.detectionScope = 'global';
  }

  if (obj.blockId !== undefined && obj.blockId !== null) {
    form.value.blockId = clampBlockId(obj.blockId);
  }
}

function buildSavePayload() {
  return {
    toolType: form.value.toolType,
    tool: { ...form.value.tool },
    memcheckOption: { ...form.value.memcheckOption },
    logLevel: form.value.logLevel,
    maxDebuglogSize: clampMaxDebuglogSize(form.value.maxDebuglogSize),
    useBlock: form.value.detectionScope === 'singleBlock',
    blockId: form.value.detectionScope === 'singleBlock' ? clampBlockId(form.value.blockId) ?? null : null,
  };
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data: buildSavePayload() });
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
  await loadSanitizerForm();

  try {
    const project = await getProjectType();

    isTritonProject.value = project.projectType === 'triton';
  }
  catch {
    isTritonProject.value = false;
  }

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
              v-if="!isA2A3Environment"
              value="npu-sanitizer"
            >
              npu-sanitizer
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
              v-model:checked="form.tool.memcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuMemoryCheck') }}
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
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.racecheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuRaceCheck') }}
            </a-checkbox>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.initcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuInitCheck') }}
            </a-checkbox>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.soccheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuSocCheck') }}
            </a-checkbox>
          </div>
          <div class="check-item-row">
            <a-checkbox
              v-model:checked="form.tool.overcheck"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.npuOverCheck') }}
            </a-checkbox>
          </div>
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
