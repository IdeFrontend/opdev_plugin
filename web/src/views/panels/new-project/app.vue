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
import { useTheme } from '@web/composables/use-theme';
import { t } from 'i18next';
import NewProject from './components/new-project.vue';

const { themeConfig } = useTheme();
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
          <NewProject />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
