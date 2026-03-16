<script setup lang="ts">
import { t } from 'i18next';
import { useTheme } from '@web/composables/use-theme';
import OpenProjectForm from './components/open-project-form.vue';

const { themeConfig, actualTheme } = useTheme();
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="!w-full !ml-[10px] !mr-auto !p-8 !text-left !h-screen">
      <div class="flex items-center mb-6">
        <div class="font-bold text-2xl leading-7 m-0" :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'">
          {{ t('web.openProject.title') }}
        </div>
      </div>
      <div class="h-px" :class="actualTheme === 'dark' ? 'bg-white/15' : 'bg-gray-300'" style="margin-bottom: 1.5rem; width: 100%;" />
      <div :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'">
        <div class="flex flex-col">
          <OpenProjectForm />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
