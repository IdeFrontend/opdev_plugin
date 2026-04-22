<script setup lang="ts">
import {
  ref, onBeforeMount,
} from 'vue';
import { t } from 'i18next';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  getConfigData, saveConfig, startSimulate, openExternalLink, executeVscodeCommand, getSelectedOperators,
  getSimulationShowQuickOptions, setSimulationShowQuickOptions,
} from '@web/apis';

// 使用主题管理组合式函数
const {
  themeConfig, actualTheme,
} = useTheme();
const simulateOptions = ref({
  user_options: {
    PMSampling: true,
    ResourceConflictRatio: true,
  },
});
const loading = ref(false);
const isExecuting = ref(false);
/** When true, workspace `performanceTuning.simulation.showQuickOptions` is false (tree runs without opening this panel). */
const doNotShowAgain = ref(false);
const guide = 'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';

const fetchConfig = async () => {
  try {
    loading.value = true;
    const configObj = await getConfigData();

    console.log('configObj', configObj);
    const keys = Object.keys(configObj || {});
    const configData = configObj[keys[0]] || [];
    const simulateConfig = configData.find((v) => v.config_type === 'simulate');

    console.log('simulateConfig', simulateConfig);

    if (simulateConfig) {
      simulateOptions.value = JSON.parse(JSON.stringify(simulateConfig));
    }
  }
  catch (error) {
    console.error('获取仿真配置失败: ', error);
  }
  finally {
    loading.value = false;
  }
};

const handleChange = async () => {
  await saveConfig({
    type: 'simulate',
    data: [simulateOptions.value],
  });
};

const handleConfirm = async () => {
  if (!simulateOptions.value || isExecuting.value) {
    return;
  }

  try {
    isExecuting.value = true;

    // 获取已选择的算子名称（如果是标准自定义算子）
    let operatorNames;

    try {
      const selectedOperators = await getSelectedOperators();

      if (selectedOperators) {
        operatorNames = selectedOperators;
      }
    }
    catch (error) {
      console.warn('获取已选择的算子失败:', error);
    }

    // 执行仿真
    startSimulate({ operatorNames });
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('仿真启动失败: ', error);
    message.error(t('web.options.simulationFailed'));
  }
  finally {
    isExecuting.value = false;
  }
};

const jumpToGuide = () => {
  openExternalLink(guide);
};

async function syncDoNotShowToWorkspace() {
  await setSimulationShowQuickOptions(!doNotShowAgain.value);
}

onBeforeMount(async () => {
  await fetchConfig();
  try {
    const showQuick = await getSimulationShowQuickOptions();
    doNotShowAgain.value = !showQuick;
  }
  catch {
    doNotShowAgain.value = false;
  }
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="simulate-config-page">
      <div class="page-header">
        {{ t('web.options.simulator.title') }}
      </div>

      <div class="simulate-content">
        <a-alert
          type="info"
          show-icon
          :message="t('web.options.simulator.alert')"
          style="margin-bottom: 12px"
        />
        <div class="simulate-title">
          {{ t('web.options.simulator.collectContent') }}
          <a-tooltip :overlay-style="{ maxWidth: '300px' }">
            <template #title>
              <div>
                {{ t('web.options.simulator.guideRef') }}
                <span
                  style="color: #1677ff; cursor: pointer;"
                  @click="jumpToGuide"
                >{{ t('web.options.guideLinkText') }}</span>
              </div>
            </template>
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          {{ t('web.options.simulator.instructionPipeline') }}
        </div>
        <div class="nested-checkbox-group">
          <div style="margin-bottom: 12px">
            {{ t('web.options.simulator.instructionPipelineDesc') }}
          </div>
          {{ t('web.options.simulator.extraOptions') }}
          <a-checkbox
            v-model:checked="simulateOptions.user_options.PMSampling"
            @change="handleChange"
          >
            {{ t('web.options.simulator.memoryThroughput') }}
          </a-checkbox>
        </div>

        <div style="margin-top: 12px">
          {{ t('web.options.simulator.codeHotspot') }}
        </div>
        <div class="nested-checkbox-group">
          {{ t('web.options.simulator.extraOptions') }}
          <a-checkbox
            v-model:checked="simulateOptions.user_options.ResourceConflictRatio"
            @change="handleChange"
          >
            {{ t('web.options.simulator.resourceConflict') }}
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
            {{ t('web.options.simulator.startNow') }}
          </a-button>
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.simulate-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px solid v-bind('actualTheme === "dark" ? "#424242" : "#d9d9d9"');
    text-align: left;
    padding: 20px;
  }

  .simulate-content {
    padding: 20px;
  }

  .simulate-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
      cursor: pointer;
    }
  }

  .nested-checkbox-group {
    width: fit-content;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid v-bind('actualTheme === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"');
  }

  .do-not-show-row {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid v-bind('actualTheme === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"');
  }

  .footer-actions {
    margin-top: 12px;
  }
}
</style>
