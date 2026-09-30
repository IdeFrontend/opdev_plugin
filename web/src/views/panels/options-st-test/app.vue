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
import i18next from 'i18next';
import enUs from 'ant-design-vue/es/locale/en_US';
import zhCn from 'ant-design-vue/es/locale/zh_CN';

import { useTheme } from '@web/composables/use-theme';
import StTestOptionsView from './components/st-test-options-view.vue';

const {
  themeConfig,
  getPopupContainer,
} = useTheme();
const resolvedLanguage = (i18next.resolvedLanguage ?? 'en').toLowerCase();
const antLocale = resolvedLanguage.startsWith('zh') ? zhCn : enUs;
</script>

<template>
  <a-config-provider
    :theme="themeConfig"
    :locale="antLocale"
    :get-popup-container="getPopupContainer"
  >
    <StTestOptionsView />
  </a-config-provider>
</template>

<style scoped>
:global(body) {
  margin: 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
}
</style>
