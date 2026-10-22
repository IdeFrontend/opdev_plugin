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
  computed,
  shallowRef,
  watch,
} from 'vue';
import { t } from 'i18next';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';

import {
  formatStTestResultStatus,
  type StTestMode,
  type StTestResultRowDto,
  type StTestRowOutcome,
} from '@shared/st-test-results';

const props = defineProps<{
  rows: readonly StTestResultRowDto[];
}>();

type ModeFilter = 'all' | StTestMode;
type OutcomeFilter = 'all' | StTestRowOutcome;

const modeFilter = shallowRef<ModeFilter>('all');
const outcomeFilter = shallowRef<OutcomeFilter>('all');
const currentPage = shallowRef(1);
const pageSize = shallowRef(50);

const visibleRows = computed(() => props.rows.filter((row) => (
  (modeFilter.value === 'all' || row.mode === modeFilter.value)
  && (outcomeFilter.value === 'all' || row.outcome === outcomeFilter.value)
)));

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  pageSizeOptions: [
    '50',
    '100',
    '200',
  ],
  showSizeChanger: true,
  showTotal: (total: number) => t('stTest.results.paginationTotal', { total }),
}));

watch([
  modeFilter,
  outcomeFilter,
], () => {
  currentPage.value = 1;
});

function outcomeLabel(outcome: StTestRowOutcome): string {
  return t(`stTest.results.rowOutcome.${outcome}`);
}

function statusLabel(row: StTestResultRowDto): string {
  const label = outcomeLabel(row.outcome);

  return formatStTestResultStatus(row, label, (status) =>
    t('stTest.results.invalidStatusWithCsv', {
      invalid: label,
      status,
    }));
}

function handleTableChange(nextPagination: {
  current?: number;
  pageSize?: number;
}): void {
  currentPage.value = nextPagination.current ?? 1;
  pageSize.value = nextPagination.pageSize ?? 50;
}
</script>

<template>
  <section :aria-label="t('stTest.results.table')">
    <div class="table-toolbar">
      <a-select
        v-model:value="modeFilter"
        class="filter-select"
        :aria-label="t('stTest.results.filterMode')"
      >
        <a-select-option value="all">
          {{ t('stTest.results.filterAllModes') }}
        </a-select-option>
        <a-select-option value="kernel">
          kernel
        </a-select-option>
        <a-select-option value="aclnn">
          aclnn
        </a-select-option>
        <a-select-option value="e2e">
          e2e
        </a-select-option>
      </a-select>
      <a-select
        v-model:value="outcomeFilter"
        class="filter-select"
        :aria-label="t('stTest.results.filterStatus')"
      >
        <a-select-option value="all">
          {{ t('stTest.results.filterAllStatuses') }}
        </a-select-option>
        <a-select-option value="pass">
          PASS
        </a-select-option>
        <a-select-option value="fail">
          FAIL
        </a-select-option>
        <a-select-option value="invalid">
          {{ t('stTest.results.rowOutcome.invalid') }}
        </a-select-option>
      </a-select>
    </div>

    <a-table
      :data-source="visibleRows"
      :pagination="pagination"
      :scroll="{ x: 1180 }"
      row-key="id"
      size="small"
      @change="handleTableChange"
    >
      <a-table-column
        key="mode"
        data-index="mode"
        :title="t('stTest.results.column.mode')"
        :width="90"
      />
      <a-table-column
        key="testFile"
        data-index="testFile"
        :title="t('stTest.results.column.testFile')"
        :width="220"
      >
        <template #default="{ text }">
          <a-tooltip :title="text">
            <span class="ellipsis-cell">{{ text }}</span>
          </a-tooltip>
        </template>
      </a-table-column>
      <a-table-column
        key="testcaseName"
        data-index="testcaseName"
        :title="t('stTest.results.column.testcase')"
        :width="220"
      >
        <template #default="{ text }">
          <a-tooltip :title="text">
            <span class="ellipsis-cell">{{ text || t('stTest.results.missingValue') }}</span>
          </a-tooltip>
        </template>
      </a-table-column>
      <a-table-column
        key="dynPrecision"
        data-index="dynPrecision"
        :title="t('stTest.results.column.dynPrecision')"
        :width="140"
      />
      <a-table-column
        key="cstPrecision"
        data-index="cstPrecision"
        :title="t('stTest.results.column.cstPrecision')"
        :width="140"
      />
      <a-table-column
        key="binPrecision"
        data-index="binPrecision"
        :title="t('stTest.results.column.binPrecision')"
        :width="140"
      />
      <a-table-column
        key="precisionStatus"
        data-index="precisionStatus"
        :title="t('stTest.results.column.status')"
        :width="150"
        fixed="right"
      >
        <template #default="{ record }">
          <span
            class="status-cell"
            :class="`status-${record.outcome}`"
          >
            <CheckCircleOutlined
              v-if="record.outcome === 'pass'"
              aria-hidden="true"
            />
            <CloseCircleOutlined
              v-else-if="record.outcome === 'fail'"
              aria-hidden="true"
            />
            <WarningOutlined
              v-else
              aria-hidden="true"
            />
            <span>{{ statusLabel(record) }}</span>
          </span>
        </template>
      </a-table-column>
    </a-table>
  </section>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-select {
  width: 180px;
}

.ellipsis-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.status-pass {
  color: var(--vscode-testing-iconPassed);
}

.status-fail {
  color: var(--vscode-testing-iconFailed);
}

.status-invalid {
  color: var(--vscode-editorWarning-foreground);
}
</style>
