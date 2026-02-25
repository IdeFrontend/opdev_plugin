<script setup lang="ts">
import {
  ref, onMounted,
} from 'vue';
import { message } from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  getConfigData, saveConfig, startSimulate, openExternalLink, checkTaskStatus, executeVscodeCommand, getSelectedOperators
} from '@web/apis';

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();
const simulateOptions = ref({ user_options: { PMSampling: true, ResourceConflictRatio: true } });
const loading = ref(false);
const isExecuting = ref(false);
const guide = 'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';

const fetchConfig = async () => {
  try {
    loading.value = true;
    const configObj = await getConfigData();
    console.log('configObj', configObj)
    const keys = Object.keys(configObj || {})
    const configData = configObj[keys[0]] || []
    const simulateConfig = configData.find(v => v.config_type === 'simulate')
    console.log('simulateConfig', simulateConfig)
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
  const hasRunningTask = await checkTaskStatus();
  console.log('hasRunningTask', hasRunningTask);
  if (hasRunningTask) {
    message.info('存在未执行完毕的任务，请稍后再试');
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
    } catch (error) {
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
  }
  finally {
    isExecuting.value = false;
  }
};

const jumpToGuide = () => {
  openExternalLink(guide);
};

onMounted(() => {
  fetchConfig();
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="simulate-config-page">
      <div class="page-header">
        仿真分析-选择采集内容
      </div>

      <div class="simulate-content">
        <a-alert type="info" show-icon message="执行仿真调优，需在代码中修改使用Model的配置，具体可参考README。" style="margin-bottom: 12px" />
        <div class="simulate-title">
          采集内容
          <a-tooltip :overlay-style="{ maxWidth: '300px' }">
            <template #title>
              <div>
                具体图形案例请参考<span style="color: #1677ff; cursor: pointer;" @click="jumpToGuide">算子调优工具概述</span>
              </div>
            </template>
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          指令流水图（默认采集）
        </div>
        <div class="nested-checkbox-group">
          <div style="margin-bottom: 12px">
            默认采集：计算单元和搬运单元指令耗时占比指标
          </div>
          附加选项：
          <a-checkbox v-model:checked="simulateOptions.user_options.PMSampling" @change="handleChange">
            内存通路吞吐率波形子图
          </a-checkbox>
        </div>

        <div style="margin-top: 12px">
          算子代码热点图（默认采集）
        </div>
        <div class="nested-checkbox-group">
          附加选项：
          <a-checkbox v-model:checked="simulateOptions.user_options.ResourceConflictRatio" @change="handleChange">
            资源冲突占比指标
          </a-checkbox>
        </div>

        <div class="footer-actions">
          <a-button type="primary" :loading="isExecuting" @click="handleConfirm">
            立即开始
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

  .footer-actions {
    margin-top: 12px;
  }
}
</style>
