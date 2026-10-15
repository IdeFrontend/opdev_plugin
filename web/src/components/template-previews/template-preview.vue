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

import '@vscode/codicons/dist/codicon.css';

import {
  normalizePreviewEntry,
  resolveSetiIconKind,
  type PreviewEntry,
} from './seti-file-icon';

const props = defineProps<{
  files: PreviewEntry[];
}>();

const rows = computed(() =>
  props.files.map((entry, index) => {
    const {
      name, depth, folder,
    } = normalizePreviewEntry(entry);

    return {
      key: `${depth}-${index}-${name}`,
      name,
      depth,
      folder,
      iconKind: resolveSetiIconKind(name),
    };
  }));
</script>

<template>
  <div
    class="template-preview"
    role="img"
    :aria-label="t('web.link.structureDiagram')"
  >
    <div class="template-preview__heading">
      {{ t('web.link.structureDiagram') }}
    </div>
    <div class="template-preview__tree">
      <div
        v-for="row in rows"
        :key="row.key"
        class="template-preview__row"
        :style="{ paddingLeft: `${row.depth * 16}px` }"
      >
        <span
          v-if="row.folder"
          class="codicon template-preview__chevron"
          :class="row.folder === 'expanded' ? 'codicon-chevron-down' : 'codicon-chevron-right'"
          aria-hidden="true"
        />
        <span
          v-else
          class="seti-file-icon"
          :class="`seti-file-icon--${row.iconKind}`"
          aria-hidden="true"
        />
        <span class="template-preview__label">{{ row.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: seti;
  src: url('@/assets/fonts/seti.woff') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}

.template-preview {
  display: block;
  width: 100%;
  padding: 0;
  border-radius: 4px;
  font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
  font-size: var(--vscode-font-size, 13px);
  line-height: 22px;
  color: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
  background: transparent;
}

.template-preview__heading {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: normal;
  line-height: 1.625;
  color: var(--vscode-descriptionForeground);
}

.template-preview__tree {
  display: inline-block;
  min-width: 0;
  margin-left: 8px;
}

.template-preview__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}

.template-preview__label {
  white-space: nowrap;
}

.template-preview__chevron {
  flex-shrink: 0;
  color: var(--vscode-icon-foreground, currentColor);
}

.seti-file-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  font-family: seti, sans-serif;
  font-size: 16px;
  line-height: 1;
  font-style: normal;
  font-weight: normal;
}

.seti-file-icon::before {
  -webkit-font-smoothing: antialiased;
}

.seti-file-icon--git::before {
  content: '\e034';
  color: #41535b;
}

.seti-file-icon--shell::before {
  content: '\e089';
  color: #8dc149;
}

.seti-file-icon--cmake::before {
  content: '\e05f';
  color: #519aba;
}

.seti-file-icon--info::before {
  content: '\e04d';
  color: #519aba;
}

.seti-file-icon--python::before {
  content: '\e07b';
  color: #519aba;
}

.seti-file-icon--c::before {
  content: '\e00c';
  color: #519aba;
}

.seti-file-icon--markdown::before {
  content: '\e060';
  color: #519aba;
}

.seti-file-icon--default::before {
  content: '\e023';
  color: #d4d7d6;
}

:global(.vscode-light) .seti-file-icon--git::before {
  color: #3b4b52;
}

:global(.vscode-light) .seti-file-icon--shell::before {
  color: #7fae42;
}

:global(.vscode-light) .seti-file-icon--cmake::before,
:global(.vscode-light) .seti-file-icon--info::before,
:global(.vscode-light) .seti-file-icon--python::before,
:global(.vscode-light) .seti-file-icon--c::before,
:global(.vscode-light) .seti-file-icon--markdown::before {
  color: #498ba7;
}

:global(.vscode-light) .seti-file-icon--default::before {
  color: #bfc2c1;
}

@media (max-width: 576px) {
  .template-preview__heading {
    font-size: 14px;
  }
}
</style>
