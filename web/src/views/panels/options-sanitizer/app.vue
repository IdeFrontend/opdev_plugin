<script setup lang="ts">
import {
  ref, onBeforeMount,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import {
  getSanitizerConfigs,
  saveSanitizerForm as saveSanitizerFormAPI,
  runSanitizer,
  executeVscodeCommand,
  getSelectedOperators,
  getSanitizerShowQuickOptions,
  setSanitizerShowQuickOptions,
} from '@web/apis';

// 使用主题管理组合式函数
const {
  themeConfig,
} = useTheme();
const isExecuting = ref(false);
/** When true, workspace `sanitizer.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);
const form = ref({
  tool: {
    memcheck: true,
    racecheck: false,
    initcheck: false,
  }, // 检测内容
  memcheckOption: {
    'check-unused-memory': false,
    'leak-check': false,
  }, // 内存检测可选项
});

async function loadSanitizerForm() {
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};

  Object.keys(form.value)
    .forEach((key) => {
      if (obj[key] !== undefined) {
        form.value[key] = obj[key];
      }
    });
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data: JSON.parse(JSON.stringify(form.value)) });
}

onBeforeMount(async () => {
  await loadSanitizerForm();
  try {
    const showQuick = await getSanitizerShowQuickOptions();
    doNotShowAgain.value = !showQuick;
  }
  catch {
    doNotShowAgain.value = false;
  }
});

async function syncDoNotShowToWorkspace() {
  await setSanitizerShowQuickOptions(!doNotShowAgain.value);
}

const handleConfirm = async () => {
  if (!form.value || isExecuting.value) {
    return;
  }

  try {
    isExecuting.value = true;

    // 获取已选择的算子名称（如果是标准自定义算子）
    let operatorNames: string | undefined;

    try {
      const selectedOperators = await getSelectedOperators();

      if (selectedOperators) {
        operatorNames = selectedOperators;
      }
    }
    catch (error) {
      console.warn('获取已选择的算子失败:', error);
    }

    // 执行异常检测
    runSanitizer({ operatorNames });
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('异常检测启动失败: ', error);
    message.error(t('web.options.sanitizerFailed'));
  }
  finally {
    isExecuting.value = false;
  }
};
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="sanitizer-config-page">
      <div class="page-header">
        {{ t('web.options.sanitizer.title') }}
      </div>

      <div class="sanitizer-content">
        <a-checkbox
          v-model:checked="form.tool.memcheck"
          @change="saveSanitizerForm"
        >
          {{ t('web.options.sanitizer.memory') }}
        </a-checkbox>
        <div
          v-if="form.tool.memcheck"
          class="mem-check"
        >
          <div class="desc">
            {{ t('web.options.sanitizer.memoryBase') }}
          </div>
          <div class="desc">
            {{ t('web.options.sanitizer.memoryExtra') }}
          </div>
          <div class="mem-option">
            <a-checkbox
              v-model:checked="form.memcheckOption['leak-check']"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.memoryLeak') }}
            </a-checkbox>
            <a-checkbox
              v-model:checked="form.memcheckOption['check-unused-memory']"
              style="margin-left: 12px;"
              @change="saveSanitizerForm"
            >
              {{ t('web.options.sanitizer.allocUnused') }}
            </a-checkbox>
          </div>
        </div>
        <div class="check-item-row">
          <a-checkbox
            v-model:checked="form.tool.racecheck"
            @change="saveSanitizerForm"
          >
            {{ t('web.options.sanitizer.race') }}
          </a-checkbox>
        </div>
        <div class="check-item-row">
          <a-checkbox
            v-model:checked="form.tool.initcheck"
            @change="saveSanitizerForm"
          >
            {{ t('web.options.sanitizer.uninit') }}
          </a-checkbox>
        </div>

        <div class="do-not-show-row">
          <a-checkbox
            v-model:checked="doNotShowAgain"
            @change="syncDoNotShowToWorkspace"
          >
            {{ t('web.options.sanitizer.doNotShowAgain') }}
          </a-checkbox>
        </div>

        <div class="footer-actions">
          <a-button
            type="primary"
            :loading="isExecuting"
            @click="handleConfirm"
          >
            {{ t('web.options.sanitizer.startNow') }}
          </a-button>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.sanitizer-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px solid var(--op-devtools-border);
    text-align: left;
    padding: 20px;
  }

  .sanitizer-content {
    padding: 20px;
  }

  .mem-check {
    width: fit-content;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid var(--op-devtools-border);
    .desc {
        margin-bottom: 8px;
    }
  }

  .check-item-row {
    margin-top: 12px;
  }

  .do-not-show-row {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--op-devtools-border);
  }

  .footer-actions {
    margin-top: 12px;
  }
}
</style>
