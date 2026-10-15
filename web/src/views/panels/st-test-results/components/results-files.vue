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
import { computed } from 'vue';
import { t } from 'i18next';
import { FileTextOutlined } from '@ant-design/icons-vue';

import type {
  StTestResultErrorCode,
  StTestResultFileDto,
} from '@shared/st-test-results';

const props = defineProps<{
  files: readonly StTestResultFileDto[];
}>();

const emit = defineEmits<{
  openResultFile: [artifactId: string];
}>();

const invalidFiles = computed(() => props.files.filter((file) => file.error));

const ERROR_DETAIL_KEYS: Partial<Record<StTestResultErrorCode, string>> = {
  file_too_large: 'stTest.results.errorDetail.bytes',
  malformed_csv: 'stTest.results.errorDetail.record',
  missing_header: 'stTest.results.errorDetail.header',
  duplicate_header: 'stTest.results.errorDetail.header',
  invalid_row: 'stTest.results.errorDetail.record',
  row_limit_exceeded: 'stTest.results.errorDetail.rows',
};

function errorDescription(file: StTestResultFileDto): string {
  if (!file.error) {
    return '';
  }

  const message = t(`stTest.results.error.${file.error.code}`);
  const detailKey = ERROR_DETAIL_KEYS[file.error.code];

  return file.error.detail && detailKey
    ? `${message} ${t(detailKey, { detail: file.error.detail })}`
    : message;
}
</script>

<template>
  <section :aria-label="t('stTest.results.files')">
    <a-alert
      v-for="file in invalidFiles"
      :key="file.artifactId"
      class="file-alert"
      type="warning"
      show-icon
      :message="file.resultFile"
      :description="errorDescription(file)"
    >
      <template #action>
        <a-button
          size="small"
          @click="emit('openResultFile', file.artifactId)"
        >
          {{ t('stTest.results.openCsv') }}
        </a-button>
      </template>
    </a-alert>

    <a-collapse class="files-collapse">
      <a-collapse-panel
        key="result-files"
        :header="t('stTest.results.resultFiles', { count: props.files.length })"
      >
        <div
          v-for="file in props.files"
          :key="file.artifactId"
          class="file-row"
        >
          <FileTextOutlined aria-hidden="true" />
          <a-tag>{{ file.mode }}</a-tag>
          <a-tooltip :title="file.resultFile">
            <span class="file-path">{{ file.resultFile }}</span>
          </a-tooltip>
          <a-button
            type="link"
            size="small"
            @click="emit('openResultFile', file.artifactId)"
          >
            {{ t('stTest.results.openCsv') }}
          </a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </section>
</template>

<style scoped>
.file-alert + .file-alert {
  margin-top: 8px;
}

.files-collapse {
  margin-top: 8px;
}

.file-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
