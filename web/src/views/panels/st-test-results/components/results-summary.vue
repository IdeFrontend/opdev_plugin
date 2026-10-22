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
import { t } from 'i18next';

import type { StTestResultReportDto } from '@shared/st-test-results';

defineProps<{
  summary: StTestResultReportDto['summary'];
}>();
</script>

<template>
  <section
    class="summary-grid"
    :aria-label="t('stTest.results.summary')"
  >
    <a-statistic
      :title="t('stTest.results.total')"
      :value="summary.total"
    />
    <a-statistic
      :title="t('stTest.results.passed')"
      :value="summary.passed"
      class="summary-passed"
    />
    <a-statistic
      :title="t('stTest.results.failed')"
      :value="summary.failed"
      class="summary-failed"
    />
    <a-statistic
      :title="t('stTest.results.invalid')"
      :value="summary.invalid"
      class="summary-invalid"
    />
    <a-statistic
      :title="t('stTest.results.files')"
      :value="summary.files"
    />
  </section>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(100px, 1fr));
  gap: 12px;
}

.summary-grid :deep(.ant-statistic) {
  padding: 12px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  background: var(--vscode-editorWidget-background);
}

.summary-passed :deep(.ant-statistic-content) {
  color: var(--vscode-testing-iconPassed);
}

.summary-failed :deep(.ant-statistic-content) {
  color: var(--vscode-testing-iconFailed);
}

.summary-invalid :deep(.ant-statistic-content) {
  color: var(--vscode-editorWarning-foreground);
}

@media (max-width: 800px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }
}
</style>
