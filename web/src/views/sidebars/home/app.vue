<template>
  <a-config-provider :theme="themeConfig">
    <a-collapse
      v-model:active-key="activeKey"
      :bordered="false"
    >
      <div style="margin-bottom: 15px" :class="textContentClass">
        <span>
          {{ t('web.home.clickOpen') }}<a-button
            type="link"
            style="display: contents;"
            @click="openHelpPage"
          > {{ t('web.home.helpGuide') }} </a-button>{{ t('web.home.orOpen') }}<a-button
            type="link"
            style="display: contents;"
            @click="openHomePage"
          > {{ t('web.home.welcomeHome') }} </a-button>{{ t('web.home.viewPluginIntro') }}
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
    </a-collapse>
  </a-config-provider>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { t } from 'i18next';
import { vscode } from '@web/utils/vscode';
import { useTheme } from '@web/composables/use-theme';

const { actualTheme, themeConfig } = useTheme();

// 根据主题获取文本颜色类
const textContentClass = computed(() => actualTheme.value === 'dark' ? 'text-dark' : 'text-light');

const activeKey = ref(['1']);

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
    url: 'https://gitcode.com/org/cann/discussions/54',
  });
};
</script>

<style lang="less" scoped>
.text-dark {
  color: #ffffff;
}

.text-light {
  color: #1f1f1f;
}
</style>
