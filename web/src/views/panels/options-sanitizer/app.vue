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
} from '@web/apis';
import { getProjectType } from '@web/apis/home';

const { themeConfig } = useTheme();
const isExecuting = ref(false);
const isTritonProject = ref(false);
/** When true, workspace `sanitizer.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);

type DetectionScopeUi = 'global' | 'singleBlock';

const form = ref({
  tool: {
    memcheck: true,
    racecheck: false,
    initcheck: false,
  },
  memcheckOption: {
    'check-unused-memory': false,
    'leak-check': false,
  },
  logLevel: 'warn' as 'info' | 'warn' | 'error',
  maxDebuglogSize: 1024,
  detectionScope: 'global' as DetectionScopeUi,
  blockId: null as number | null,
});

const showBlockId = computed(() => form.value.detectionScope === 'singleBlock');

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

function clampBlockId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const n = Math.trunc(Number(value));

  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.min(Math.max(n, 0), 200);
}

async function loadSanitizerForm() {
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};

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
    tool: { ...form.value.tool },
    memcheckOption: { ...form.value.memcheckOption },
    logLevel: form.value.logLevel,
    maxDebuglogSize: clampMaxDebuglogSize(form.value.maxDebuglogSize),
    useBlock: form.value.detectionScope === 'singleBlock',
    blockId: form.value.detectionScope === 'singleBlock' ? clampBlockId(form.value.blockId) : null,
  };
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data: buildSavePayload() });
}

function onDetectionScopeChange() {
  // Default a block id when switching to single-block so the run cannot silently
  // fall back to all-blocks (the strategy omits --block-id when blockId is null).
  if (form.value.detectionScope === 'singleBlock' && form.value.blockId === null) {
    form.value.blockId = 0;
  }

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

        <div class="run-settings-section">
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
              v-model:value="form.blockId"
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
  }
}
</style>
