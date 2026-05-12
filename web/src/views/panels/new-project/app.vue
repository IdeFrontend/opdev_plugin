<script setup lang="ts">
import { useTheme } from '@web/composables/use-theme';
import { t } from 'i18next';
import NewProjectSSH from './components/new-project-ssh.vue';

const {
  themeConfig,
} = useTheme();
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="!w-full !ml-[10px] !mr-auto !p-8 !text-left !h-screen">
      <div class="flex items-center mb-6">
        <div class="font-bold text-2xl leading-7 m-0 op-text">
          {{ t('web.home.newOperatorProject') }}
        </div>
      </div>
      <div
        class="h-px bg-[var(--op-devtools-border)]"
        style="margin-bottom: 1.5rem; width: 100%;"
      />
      <div class="op-text">
        <div class="flex flex-col">
          <NewProjectSSH />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
