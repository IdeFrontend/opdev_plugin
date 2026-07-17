<script setup lang="ts">
import i18next from 'i18next';
import enUs from 'ant-design-vue/es/locale/en_US';
import zhCn from 'ant-design-vue/es/locale/zh_CN';

import { useTheme } from '@web/composables/use-theme';
import StTestResultsView from './components/st-test-results-view.vue';

const {
  themeConfig,
  getPopupContainer,
} = useTheme();

const resolvedLanguage = (i18next.resolvedLanguage ?? 'en').toLowerCase();
const antLocale = resolvedLanguage.startsWith('zh')
  ? zhCn
  : enUs;
</script>

<template>
  <a-config-provider
    :theme="themeConfig"
    :locale="antLocale"
    :get-popup-container="getPopupContainer"
  >
    <StTestResultsView />
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
