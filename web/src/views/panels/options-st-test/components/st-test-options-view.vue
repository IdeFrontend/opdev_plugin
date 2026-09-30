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
import { onBeforeMount } from 'vue';
import { t } from 'i18next';

import ModeArgumentsCard from './mode-arguments-card.vue';
import { useStTestOptions } from '../composables/use-st-test-options';

const {
  loading,
  running,
  globalError,
  selectedModes,
  argumentsByMode,
  availableModes,
  operatorName,
  modeErrors,
  canRun,
  commandPreviews,
  load,
  setModeSelected,
  setModeArguments,
  resetModeArguments,
  run,
} = useStTestOptions();

onBeforeMount(load);
</script>

<template>
  <main class="options-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">
          {{ t('stTest.options.title') }}
        </h1>
        <p class="page-subtitle">
          {{ t('stTest.options.subtitle') }}
        </p>
      </div>
      <div
        v-if="operatorName"
        class="operator-context"
      >
        <span class="context-label">{{ t('stTest.options.operator') }}</span>
        <strong>{{ operatorName }}</strong>
      </div>
    </header>

    <a-spin :spinning="loading">
      <a-alert
        v-if="globalError"
        class="global-alert"
        type="error"
        show-icon
        :message="globalError"
      />

      <a-empty
        v-if="!globalError && !loading && availableModes.length === 0"
        :description="t('stTest.options.noModes')"
      />

      <div
        v-else-if="!globalError"
        class="content"
      >
        <section class="modes-section">
          <h2 class="section-title">
            {{ t('stTest.options.modesHeading') }}
          </h2>
          <p class="section-description">
            {{ t('stTest.options.modesDescription') }}
          </p>
          <div class="mode-grid">
            <ModeArgumentsCard
              v-for="mode in availableModes"
              :key="mode"
              :mode="mode"
              :selected="selectedModes.includes(mode)"
              :tokens="argumentsByMode[mode]"
              :error="modeErrors[mode]"
              @selected-change="setModeSelected(mode, $event)"
              @tokens-change="setModeArguments(mode, $event)"
              @reset="resetModeArguments(mode)"
            />
          </div>
        </section>

        <section class="preview-section">
          <h2 class="section-title">
            {{ t('stTest.options.previewHeading') }}
          </h2>
          <p class="section-description">
            {{ t('stTest.options.previewDescription') }}
          </p>
          <pre class="command-preview"><code v-if="commandPreviews.length">{{ commandPreviews.join('\n') }}</code><code v-else>{{ t('stTest.options.previewEmpty') }}</code></pre>
        </section>

        <footer class="footer-actions">
          <a-button
            type="primary"
            :loading="running"
            :disabled="!canRun"
            @click="run"
          >
            {{ t('stTest.options.run') }}
          </a-button>
        </footer>
      </div>
    </a-spin>
  </main>
</template>

<style scoped>
.options-page {
  min-height: 100vh;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--vscode-widget-border, var(--op-devtools-border));
}

.page-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}

.page-subtitle,
.section-description {
  margin: 4px 0 0;
  color: var(--vscode-descriptionForeground);
}

.operator-context {
  display: grid;
  gap: 2px;
  min-width: 160px;
  text-align: right;
}

.context-label {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.global-alert {
  margin: 20px 24px 0;
}

.content {
  display: grid;
  gap: 24px;
  padding: 20px 24px 24px;
}

.section-title {
  margin: 0;
  font-size: 15px;
}

.mode-grid {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.preview-section {
  min-width: 0;
}

.command-preview {
  overflow: auto;
  margin: 12px 0 0;
  padding: 12px;
  border: 1px solid var(--vscode-widget-border, var(--op-devtools-border));
  border-radius: 4px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  background: var(--vscode-terminal-background, var(--vscode-textCodeBlock-background));
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 13px);
  white-space: pre-wrap;
  word-break: break-word;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .page-header {
    display: grid;
  }

  .operator-context {
    text-align: left;
  }
}
</style>
