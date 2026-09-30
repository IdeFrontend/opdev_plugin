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
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons-vue';
import { t } from 'i18next';

import type { StTestMode } from '@shared/st-test-results';

const props = defineProps<{
  mode: StTestMode;
  selected: boolean;
  tokens: readonly string[];
  error?: string;
}>();

const emit = defineEmits<{
  selectedChange: [selected: boolean];
  tokensChange: [tokens: string[]];
  reset: [];
}>();

function replaceToken(index: number, value: string): void {
  const next = [...props.tokens];

  next[index] = value;
  emit('tokensChange', next);
}

function addToken(): void {
  emit('tokensChange', [
    ...props.tokens,
    '',
  ]);
}

function removeToken(index: number): void {
  emit('tokensChange', props.tokens.filter((_, tokenIndex) => tokenIndex !== index));
}

function moveToken(index: number, offset: -1 | 1): void {
  const targetIndex = index + offset;

  if (targetIndex < 0 || targetIndex >= props.tokens.length) {
    return;
  }

  const next = [...props.tokens];

  [
    next[index],
    next[targetIndex],
  ] = [
    next[targetIndex],
    next[index],
  ];
  emit('tokensChange', next);
}
</script>

<template>
  <section
    class="mode-card"
    :class="{ 'mode-card-selected': selected }"
  >
    <header class="mode-card-header">
      <a-checkbox
        :checked="selected"
        @update:checked="emit('selectedChange', Boolean($event))"
      >
        <span class="mode-name">{{ t(`stTest.mode.${mode}`) }}</span>
        <span class="mode-code">{{ mode }}</span>
      </a-checkbox>
      <a-button
        size="small"
        type="text"
        :title="t('stTest.options.resetArguments')"
        @click="emit('reset')"
      >
        <template #icon>
          <ReloadOutlined />
        </template>
        {{ t('stTest.options.reset') }}
      </a-button>
    </header>

    <div class="token-list">
      <div
        v-for="(token, index) in tokens"
        :key="`${mode}-${index}`"
        class="token-row"
      >
        <span class="token-index">{{ index + 1 }}</span>
        <a-input
          :value="token"
          :status="error ? 'error' : undefined"
          :aria-label="t('stTest.options.argumentLabel', { index: index + 1, mode })"
          @update:value="replaceToken(index, String($event))"
        />
        <a-button
          type="text"
          size="small"
          :disabled="index === 0"
          :title="t('stTest.options.moveUp')"
          @click="moveToken(index, -1)"
        >
          <template #icon>
            <UpOutlined />
          </template>
        </a-button>
        <a-button
          type="text"
          size="small"
          :disabled="index === tokens.length - 1"
          :title="t('stTest.options.moveDown')"
          @click="moveToken(index, 1)"
        >
          <template #icon>
            <DownOutlined />
          </template>
        </a-button>
        <a-button
          type="text"
          size="small"
          danger
          :title="t('stTest.options.removeArgument')"
          @click="removeToken(index)"
        >
          <template #icon>
            <DeleteOutlined />
          </template>
        </a-button>
      </div>
    </div>

    <a-button
      class="add-token-button"
      size="small"
      @click="addToken"
    >
      <template #icon>
        <PlusOutlined />
      </template>
      {{ t('stTest.options.addArgument') }}
    </a-button>

    <div
      v-if="error"
      class="mode-error"
      role="alert"
    >
      {{ error }}
    </div>
  </section>
</template>

<style scoped>
.mode-card {
  padding: 14px;
  border: 1px solid var(--vscode-widget-border, var(--op-devtools-border));
  border-radius: 6px;
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
}

.mode-card-selected {
  border-color: var(--vscode-focusBorder);
}

.mode-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mode-name {
  font-weight: 600;
}

.mode-code {
  margin-left: 8px;
  color: var(--vscode-descriptionForeground);
  font-family: var(--vscode-editor-font-family, monospace);
}

.token-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.token-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 4px;
}

.token-index {
  color: var(--vscode-descriptionForeground);
  text-align: right;
}

.add-token-button {
  display: inline-flex;
  align-items: center;
  margin-top: 10px;
}

.mode-error {
  margin-top: 8px;
  color: var(--vscode-errorForeground);
  font-size: 12px;
}
</style>
