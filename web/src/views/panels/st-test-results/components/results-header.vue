<script setup lang="ts">
import { computed } from 'vue';
import { t } from 'i18next';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';

import type { StTestReportOutcome } from '@shared/st-test-results';

const props = defineProps<{
  operatorName: string;
  outcome: StTestReportOutcome;
}>();

const status = computed(() => ({
  passed: {
    label: t('stTest.results.outcome.passed'),
    color: 'success',
    icon: CheckCircleOutlined,
  },
  failed: {
    label: t('stTest.results.outcome.failed'),
    color: 'error',
    icon: CloseCircleOutlined,
  },
  invalid: {
    label: t('stTest.results.outcome.invalid'),
    color: 'warning',
    icon: WarningOutlined,
  },
}[props.outcome]));
</script>

<template>
  <header class="results-header">
    <div>
      <h1 class="results-title">
        {{ t('stTest.results.heading') }}
      </h1>
      <div class="operator-name">
        {{ props.operatorName }}
      </div>
    </div>
    <a-tag
      class="outcome-tag"
      :color="status.color"
    >
      <component :is="status.icon" />
      <span>{{ status.label }}</span>
    </a-tag>
  </header>
</template>

<style scoped>
.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.results-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.operator-name {
  margin-top: 4px;
  color: var(--vscode-descriptionForeground);
}

.outcome-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 5px 10px;
  font-weight: 600;
}
</style>
