<script setup lang="ts">
import { provide } from 'vue';
import { useTheme } from '@web/composables/use-theme';
import { t } from 'i18next';
import linkSSH from './components/link-ssh.vue';

const {
  themeConfig, actualTheme,
} = useTheme();

provide('actualTheme', actualTheme);
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="!w-full !ml-[10px] !mr-auto !p-8 !text-left !h-screen">
      <div class="flex items-center mb-6">
        <div
          class="font-bold text-2xl leading-7 m-0"
          :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'"
        >
          {{ t('web.home.newOperatorProject') }}
        </div>
      </div>
      <div
        class="h-px"
        :class="actualTheme === 'dark' ? 'bg-white/15' : 'bg-gray-300'"
        style="margin-bottom: 1.5rem; width: 100%;"
      />
      <div :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'">
        <div class="flex flex-col">
          <linkSSH />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
