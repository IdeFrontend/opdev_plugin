<script setup lang="ts">
import {
  ref, reactive, computed, onMounted, watch, nextTick,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import {
  getDataCollectionConfig, saveDataCollectionConfig, startNewToolCollection, executeVscodeCommand, getSelectedOperators,
} from '@web/apis';
import { selectFile } from '@web/apis/performance-run-data';
import type {
  CollectionType, DataCollectionConfig,
} from '@shared/data-collection-config';
import {
  DATA_COLLECTION_SECTIONS,
  DATA_COLLECTION_SETS,
  DATA_COLLECTION_SET_SECTIONS,
  DATA_COLLECTION_SECTION_DESC,
  DATA_COLLECTION_UNSUPPORTED_SECTIONS,
  DATA_COLLECTION_UNSUPPORTED_SETS,
  buildDefaultCommandLine,
  buildDefaultDataCollectionConfig,
  describeDataCollectionSet,
  matchSetForSections,
} from '@shared/data-collection-config';

const { themeConfig } = useTheme();

/** Local reactive copy of the dialog config (seeded from the plugin on mount). */
const config = reactive<DataCollectionConfig>(buildDefaultDataCollectionConfig('onboard'));

const loading = ref(false);
const isExecuting = ref(false);
/** Metrics table active tab: pick by section (multi) or by set (single). */
const metricsKind = ref<'section' | 'set'>('set');
/** Right-side "Enter Filter..." text for the Metrics table Name column. */
const metricsFilter = ref('');
/** Guards the section↔set linkage watchers against mutual re-entrancy. */
let syncingMetrics = false;
/**
 * True while the restored config is being seeded on mount. The metrics/type
 * watchers fire asynchronously (flush: 'pre'), so a synchronous guard would be
 * cleared before they run; this stays set until after they flush so a restored
 * (possibly hand-edited) commandLine is not re-derived over.
 */
let seeding = false;

/** Rows for the Metrics table in section mode (all share the one description). */
const sectionRows = computed(() => DATA_COLLECTION_SECTIONS
  .filter((name) => !metricsFilter.value || name.toLowerCase()
    .includes(metricsFilter.value.toLowerCase()))
  .map((name) => ({
    key: name,
    name,
    description: DATA_COLLECTION_SECTION_DESC,
  })));

/** Rows for the Metrics table in set mode (description = the set's section list / placeholder). */
const setRows = computed(() => DATA_COLLECTION_SETS
  .filter((name) => !metricsFilter.value || name.toLowerCase()
    .includes(metricsFilter.value.toLowerCase()))
  .map((name) => ({
    key: name,
    name,
    description: describeDataCollectionSet(name),
  })));

const sectionColumns = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: 'Description',
    dataIndex: 'description',
    key: 'description',
  },
];

/** Section-mode multi-select (rows checked in the table). */
const selectedSectionKeys = computed({
  get: () => [...config.metrics.sections],
  set: (keys: string[]) => {
    setSections(keys);
  },
});

/** Set-mode single-select (one row selected). */
const selectedSetKey = ref<string>(config.metrics.set ?? 'basic');

/** Regenerate the commandLine text from the current structured selections. */
function refreshCommandLine() {
  config.common.commandLine = buildDefaultCommandLine(config);
}

/**
 * Apply a new section multi-selection (section mode). Per the linkage rule:
 * if the sections match a supported set's description, adopt that set;
 * otherwise fall back to Custom.
 */
function setSections(sections: string[]) {
  if (syncingMetrics) {
    return;
  }

  syncingMetrics = true;
  config.metrics.sections = [...sections];
  config.metrics.kind = 'section';

  const matched = matchSetForSections(sections);

  config.metrics.set = matched;
  selectedSetKey.value = matched;
  refreshCommandLine();
  syncingMetrics = false;
}

/**
 * Apply a new set single-selection (set mode). Per the linkage rule: expand the
 * set's description into the section multi-selection (Custom keeps the current
 * sections; unsupported sets clear them).
 */
function applySet(set: string) {
  if (syncingMetrics) {
    return;
  }

  syncingMetrics = true;
  selectedSetKey.value = set;
  config.metrics.set = set;
  config.metrics.kind = 'set';

  if (set !== 'Custom') {
    config.metrics.sections = [...(DATA_COLLECTION_SET_SECTIONS[set] ?? [])];
  }

  refreshCommandLine();
  syncingMetrics = false;
}

function onSetRowClick(set: string) {
  if (DATA_COLLECTION_UNSUPPORTED_SETS.has(set)) {
    return;
  }

  applySet(set);
}

// Force Overwrite toggles feed the commandLine (`--force`).
watch(() => config.common.forceOverwrite, () => {
  if (!syncingMetrics && !seeding) {
    refreshCommandLine();
  }
});

// npu-compute (onboard) takes `--section` flags; npu-emulate (simulate) takes none.
// Re-seed the commandLine when the collection type flips so metric flags match.
watch(() => config.collectionType, () => {
  if (!syncingMetrics && !seeding) {
    refreshCommandLine();
  }
});

// The set/section selector drives which Metrics table is shown; mirror the pick
// onto config.metrics.kind and re-seed the commandLine so `--section` flags stay
// consistent with the resolved selection (set expands to sections either way).
watch(metricsKind, (kind) => {
  if (syncingMetrics || seeding) {
    return;
  }

  config.metrics.kind = kind;
  refreshCommandLine();
});

async function pickOutputFile() {
  try {
    const picked = await selectFile({
      fileTypes: [
        {
          label: 'report',
          extensions: ['npu-rep'],
        },
        {
          label: t('common.allFiles'),
          extensions: ['*'],
        },
      ],
    });

    if (picked) {
      config.common.outputFile = picked;
    }
  }
  catch (error) {
    console.warn('选择输出文件失败', error);
  }
}

function handleCancel() {
  executeVscodeCommand('workbench.action.closeActiveEditor');
}

async function handleConfirm() {
  if (isExecuting.value) {
    return;
  }

  try {
    isExecuting.value = true;

    let operatorNames: string | undefined;

    try {
      const selected = await getSelectedOperators();

      if (selected) {
        operatorNames = selected;
      }
    }
    catch (error) {
      console.warn('获取已选择的算子失败', error);
    }

    // Snapshot the config once so the persisted copy and the run share it.
    const snapshot = JSON.parse(JSON.stringify(config)) as DataCollectionConfig;

    // Persist the confirmed config so reopening the dialog restores it. Best
    // effort — a failed save must not block starting the collection.
    try {
      await saveDataCollectionConfig(snapshot);
    }
    catch (error) {
      console.warn('保存数据采集配置失败', error);
    }

    // The plugin compiles first (legacy sequence) then runs the selected tool.
    startNewToolCollection({
      config: snapshot,
      operatorNames,
    });

    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('数据采集启动失败: ', error);
    message.error(t('web.dataCollection.startFailed'));
  }
  finally {
    isExecuting.value = false;
  }
}

onMounted(async () => {
  try {
    loading.value = true;

    const initial = await getDataCollectionConfig();

    // Seed the restored config without letting the metrics/type watchers
    // re-derive (and clobber) the restored, possibly hand-edited, commandLine.
    // The watchers flush asynchronously, so keep `seeding` set until after the
    // next tick lets them run.
    seeding = true;
    Object.assign(config, initial);
    config.collectionType = (initial.collectionType || 'onboard') as CollectionType;
    metricsKind.value = initial.metrics.kind ?? 'set';
    selectedSetKey.value = initial.metrics.set ?? 'basic';
    await nextTick();
    seeding = false;
  }
  catch (error) {
    console.error('获取数据采集配置失败: ', error);
  }
  finally {
    loading.value = false;
  }
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="data-collection-page">
      <div class="page-header">
        {{ t('web.dataCollection.title') }}
      </div>

      <div class="dc-content">
        <!-- Collection type: 上板 (npu-compute) / 仿真 (npu-emulate) -->
        <div class="dc-collection-type">
          <span class="dc-label">{{ t('web.dataCollection.collectionType') }}</span>
          <a-radio-group
            v-model:value="config.collectionType"
            button-style="solid"
          >
            <a-radio-button value="onboard">
              {{ t('web.dataCollection.onboard') }}
            </a-radio-button>
            <a-radio-button value="simulate">
              {{ t('web.dataCollection.simulate') }}
            </a-radio-button>
          </a-radio-group>
        </div>

        <a-divider />

        <!-- Common panel -->
        <a-collapse :default-active-key="['common', 'metrics']">
          <a-collapse-panel
            key="common"
            :header="t('web.dataCollection.common')"
          >
            <div class="dc-field">
              <span class="dc-label">Output File</span>
              <a-input-group compact>
                <a-input
                  v-model:value="config.common.outputFile"
                  class="dc-output-input"
                  :placeholder="t('web.dataCollection.outputFilePlaceholder')"
                />
                <a-button @click="pickOutputFile">
                  {{ t('web.dataCollection.browse') }}
                </a-button>
              </a-input-group>
            </div>

            <div class="dc-field">
              <span class="dc-label">Force Overwrite</span>
              <a-radio-group v-model:value="config.common.forceOverwrite">
                <a-radio :value="true">
                  Yes
                </a-radio>
                <a-radio :value="false">
                  No
                </a-radio>
              </a-radio-group>
            </div>

            <div class="dc-field">
              <span class="dc-label">Target Processes</span>
              <a-select
                v-model:value="config.common.targetProcesses"
                class="dc-select"
                :options="[{ value: 'all', label: 'All' }]"
              />
            </div>

            <div class="dc-field">
              <span class="dc-label">Replay Mode</span>
              <a-select
                v-model:value="config.common.replayMode"
                class="dc-select"
                :options="[{ value: 'application', label: 'Application' }]"
              />
            </div>

            <div class="dc-field">
              <span class="dc-label">Application Replay Buffer</span>
              <a-select
                v-model:value="config.common.applicationReplayBuffer"
                class="dc-select"
                :options="[{ value: 'file', label: 'File' }]"
              />
            </div>

            <div class="dc-field">
              <span class="dc-label">Application Replay Mode</span>
              <a-select
                v-model:value="config.common.applicationReplayMode"
                class="dc-select"
                :options="[{ value: 'balanced', label: 'Balanced' }]"
              />
            </div>

            <div class="dc-field dc-field-column">
              <span class="dc-label">Command Line</span>
              <a-textarea
                v-model:value="config.common.commandLine"
                :rows="3"
                :placeholder="t('web.dataCollection.commandLinePlaceholder')"
              />
            </div>
          </a-collapse-panel>

          <!-- Metrics panel -->
          <a-collapse-panel
            key="metrics"
            :header="t('web.dataCollection.metrics')"
          >
            <div class="dc-metrics-toolbar">
              <a-select
                v-model:value="metricsKind"
                class="dc-metrics-kind"
                :options="[
                  { value: 'set', label: 'set' },
                  { value: 'section', label: 'section' },
                ]"
              />
              <a-input
                v-model:value="metricsFilter"
                class="dc-metrics-filter"
                placeholder="Enter Filter..."
                allow-clear
              />
            </div>

            <!-- Set mode: single-select -->
            <a-table
              v-if="metricsKind === 'set'"
              class="dc-metrics-table"
              :columns="sectionColumns"
              :data-source="setRows"
              :pagination="false"
              size="small"
              :row-key="(row) => row.key"
              :custom-row="(row) => ({ onClick: () => onSetRowClick(row.key) })"
              :row-selection="{
                type: 'radio',
                selectedRowKeys: [selectedSetKey],
                onChange: (keys) => applySet(String(keys[0])),
                getCheckboxProps: (row) => ({ disabled: DATA_COLLECTION_UNSUPPORTED_SETS.has(row.key) }),
              }"
            />

            <!-- Section mode: multi-select -->
            <a-table
              v-else
              class="dc-metrics-table"
              :columns="sectionColumns"
              :data-source="sectionRows"
              :pagination="false"
              size="small"
              :row-key="(row) => row.key"
              :row-selection="{
                type: 'checkbox',
                selectedRowKeys: selectedSectionKeys,
                onChange: (keys) => setSections(keys.map(String)),
                getCheckboxProps: (row) => ({ disabled: DATA_COLLECTION_UNSUPPORTED_SECTIONS.has(row.key) }),
              }"
            />
          </a-collapse-panel>
        </a-collapse>

        <!-- Footer actions -->
        <div class="dc-footer">
          <a-button @click="handleCancel">
            {{ t('web.dataCollection.cancel') }}
          </a-button>
          <a-button
            type="primary"
            :loading="isExecuting"
            @click="handleConfirm"
          >
            {{ t('web.dataCollection.confirm') }}
          </a-button>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.data-collection-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px solid var(--op-devtools-border);
    text-align: left;
    padding: 20px;
  }

  .dc-content {
    padding: 20px;
  }

  .dc-collection-type {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .dc-label {
    display: inline-block;
    min-width: 180px;
    font-weight: 500;
  }

  .dc-field {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
  }

  .dc-field-column {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .dc-output-input {
    width: 360px;
  }

  .dc-select {
    width: 200px;
  }

  .dc-metrics-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 12px;
  }

  .dc-metrics-filter {
    width: 220px;
  }

  .dc-metrics-kind {
    width: 140px;
  }

  // Keep the row's normal background when it is the selected radio/checkbox row —
  // selection is conveyed by the control alone, without a highlighted row.
  .dc-metrics-table {
    :deep(.ant-table-tbody > tr.ant-table-row-selected > td) {
      background: transparent;
    }

    :deep(.ant-table-tbody > tr.ant-table-row-selected:hover > td) {
      background: var(--op-devtools-list-hover-background, rgba(0, 0, 0, 0.04));
    }

    // Grey out rows whose checkbox is disabled (unsupported sections).
    :deep(.ant-table-tbody > tr .ant-checkbox-disabled) {
      & ~ span {
        opacity: 0.4;
      }
    }

    :deep(.ant-table-tbody > tr:has(.ant-checkbox-disabled) > td) {
      opacity: 0.4;
    }
  }

  .dc-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--op-devtools-border);
  }
}
</style>
