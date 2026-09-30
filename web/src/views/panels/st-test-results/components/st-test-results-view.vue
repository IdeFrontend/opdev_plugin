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

import ResultsFiles from './results-files.vue';
import ResultsHeader from './results-header.vue';
import ResultsSummary from './results-summary.vue';
import ResultsTable from './results-table.vue';
import { useStTestResults } from '../composables/use-st-test-results';

const {
  report,
  hasReport,
  openResultFile,
} = useStTestResults();
</script>

<template>
  <main class="results-page">
    <template v-if="hasReport && report">
      <ResultsHeader
        :operator-name="report.operatorName"
        :outcome="report.outcome"
      />
      <div class="results-content">
        <ResultsSummary :summary="report.summary" />
        <ResultsFiles
          :files="report.files"
          @open-result-file="openResultFile"
        />
        <ResultsTable
          :key="report.runId"
          :rows="report.rows"
        />
      </div>
    </template>
    <a-empty
      v-else
      class="results-empty"
      :description="t('stTest.results.waiting')"
    />
  </main>
</template>

<style scoped>
.results-page {
  min-height: 100vh;
  background: var(--vscode-editor-background);
}

.results-content {
  display: grid;
  min-width: 0;
  gap: 16px;
  padding: 20px;
}

.results-empty {
  padding-top: 20vh;
}
</style>
