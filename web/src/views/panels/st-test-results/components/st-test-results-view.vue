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
  gap: 16px;
  padding: 20px;
}

.results-empty {
  padding-top: 20vh;
}
</style>
