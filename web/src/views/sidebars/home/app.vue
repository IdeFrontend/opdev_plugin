<!--
  Copyright (c) 2025 Huawei Technologies Co., Ltd.
  This program is free software, you can redistribute it and/or modify it under the terms and conditions of
  CANN Open Software License Agreement Version 2.0 (the "License").
  Please refer to the License for details. You may not use this file except in compliance with the License.
  THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
  INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
  See LICENSE in the root of the software repository for the full text of the License.
-->
<template>
  <a-config-provider :theme="themeConfig">
    <div>
      <div
        style="margin-bottom: 15px; color: var(--vscode-foreground);"
        class="w-full text-[13px] leading-relaxed"
      >
        <span>
          {{ t('web.home.clickOpen') }} <a-button
            type="link"
            style="display: contents;"
            @click="openHelpPage"
          >{{ t('web.home.helpGuide') }}</a-button> {{ t('web.home.orOpen') }} <a-button
            type="link"
            style="display: contents;"
            @click="openHomePage"
          >{{ t('web.home.welcomeHome') }}</a-button> {{ t('web.home.viewPluginIntro') }}
        </span>
      </div>
      <div class="w-full pb-[15px]">
        <a-button
          type="primary"
          class="w-full"
          @click="handleMenuClick"
        >
          {{ t('web.home.newOperatorProject') }}
        </a-button>
      </div>
      <div
        class="w-full pb-[15px]"
      >
        <a-button
          type="primary"
          class="w-full"
          @click="handleOpenProject"
        >
          {{ t('web.home.openOperatorProject') }}
        </a-button>
      </div>
    </div>
  </a-config-provider>
</template>
<script lang="ts" setup>
import { t } from 'i18next';
import { vscode } from '@web/utils/vscode';
import { useTheme } from '@web/composables/use-theme';

const { themeConfig } = useTheme();

const handleMenuClick = () => {
  vscode.postMessage({
    command: 'openLinkWebviewPanel',
    commandId: 'my-extension.openProjectView',
  });
};
const handleOpenProject = () => {
  vscode.postMessage({
    command: 'openProjectWebviewPanel',
    commandId: 'my-extension.openProjectView',
  });
};
const openHomePage = () => {
  vscode.postMessage({ command: 'openWelcome' });
};
const openHelpPage = () => {
  vscode.postMessage({
    command: 'openExternalLink',
    url: 'https://gitcode.com/opdevtools/plugin_release',
  });
};
</script>
