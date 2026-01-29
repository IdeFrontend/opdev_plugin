<script setup lang="ts">
import {
  ref, onMounted, computed, watch
} from 'vue';
import { theme, message } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  getConfigData, saveConfig, openExternalLink, startOnBoard, executeVscodeCommand, checkTaskStatus, getSelectedOperators
} from '@web/apis';

const themeConfig = { algorithm: theme.darkAlgorithm };
const guide = 'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';
const onboardData = ref({ user_options: {
    Occupancy: true,
    Roofline: true,
    Source: true,
    MemoryDetail: true,
    ArithmeticUtilization: true,
    L2Cache: true,
    Memory: true,
    MemoryL0: true,
    MemoryUB: true,
    PipeUtilization: true,
    ResourceConflictRatio: true,
} });
const loading = ref(false);
const isExecuting = ref(false);

const fetchConfig = async () => {
  try {
    loading.value = true;
    const configObj = await getConfigData();
    console.log('configObj', configObj)
    const keys = Object.keys(configObj || {})
    const configData = configObj[keys[0]] || []
    const onBoardConfig = configData.find(v => v.config_type === 'on_board')
    console.log('onBoardConfig', onBoardConfig)
    if (onBoardConfig) {
      onboardData.value = JSON.parse(JSON.stringify(onBoardConfig));
    }
  }
  catch (error) {
    console.error('获取上板配置失败: ', error);
  }
  finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  await saveConfig({
    type: 'on_board',
    data: [onboardData.value],
  });
}

const handleConfirm = async () => {
  if (!onboardData.value || isExecuting.value) {
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
      console.warn('获取已选择的算子失败', error);
    }
    
    // 执行上板
    startOnBoard({ operatorNames });
    // 关闭当前页面
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('上板启动失败: ', error);
  }
  finally {
    isExecuting.value = false;
  }
};

const jumpToGuide = () => {
  openExternalLink(guide);
};

const performanceSelectedAll = ref(true);
// 算子性能数据文件，这组半选
const performanceSelectedHalf = computed(() => {
  let count = 0;
  const keyArray = [
    'ArithmeticUtilization',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'PipeUtilization',
    'ResourceConflictRatio',
  ];

  keyArray.forEach((key) => {
    if (onboardData.value.user_options?.[key]) {
      count += 1;
    }
  });

  return count > 0 && count < keyArray.length;
});

const handleOperatorPerformanceChange = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  const keyArray= [
    'ArithmeticUtilization',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'PipeUtilization',
    'ResourceConflictRatio',
  ];

  keyArray.forEach((key) => {
    onboardData.value.user_options[key] = checked;
  });

  handleSave();
};

// 组内选项全部选中时，自动选上“全选”
watch(
  () => onboardData.value.user_options,
  () => {
    if (!onboardData.value.user_options) {
      return;
    }

    let count = 0;
    const keyArray = [
      'ArithmeticUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
      'MemoryUB',
      'PipeUtilization',
      'ResourceConflictRatio',
    ];

    keyArray.forEach((key) => {
      if (onboardData.value.user_options[key]) {
        count += 1;
      }
    });
    performanceSelectedAll.value = count === keyArray.length;
  },
  {
    deep: true,
    immediate: true,
  },
);

onMounted(() => {
  fetchConfig();
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="board-config-page">
      <div class="page-header">
        上板分析-选择采集内容
      </div>

      <div class="board-content">
        <a-alert
            type="info"
            show-icon
            style="margin-top: 12px"
            class="board-alert-info-content"
        >
          <template #message>
            <div style="white-space: pre-line;">
              <div>
                1、执行上板调优，需在代码中修改使用NPU的配置，具体可参考README。
              </div>
              <div>
                2、若勾选"Roofline瓶颈分析"或"Cache热力图"，将默认采集所有算子性能指标。
              </div>
            </div>
          </template>
        </a-alert>
        <div class="board-title">
          采集内容
          <a-tooltip :overlay-style="{ maxWidth: '300px' }">
            <template #title>
              <div>
                具体图形案例请参考 <span style="color: #1677ff; cursor: pointer;" @click="jumpToGuide">算子调优工具概述</span>
              </div>
            </template>
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          计算内存热力图（默认采集）
        </div>
        <div class="compute-group">
          <div style="margin-bottom: 12px">
            默认采集：基础信息、计算工作负载分析、内存负载分析
          </div>

          <span>默认选项：</span>
          <a-checkbox
            v-model:checked="onboardData.user_options.Occupancy"
            @change="handleSave"
          >
            核间负载分析）
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.Roofline"
            style="margin-left: 12px;"
            @change="handleSave"
          >
            Roofline瓶颈分析
          </a-checkbox>
          <a-tooltip title="若勾选该选项，将默认采集所有算子性能指标">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div style="margin-top: 12px">
          <a-checkbox
            v-model:checked="onboardData.user_options.Source"
            @change="handleSave"
          >
            算子代码热点）
          </a-checkbox>
        </div>

        <div class="cache-box">
          <a-checkbox
            v-model:checked="onboardData.user_options.MemoryDetail"
            @change="handleSave"
          >
            Cache热力图
          </a-checkbox>
          <a-tooltip title="若勾选该选项，将默认采集所有算子性能指标">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>

        <div>
          <a-checkbox
            v-model:checked="performanceSelectedAll"
            :indeterminate="performanceSelectedHalf"
            @change="handleOperatorPerformanceChange"
          >
            算子性能指标
          </a-checkbox>
        </div>
        <div class="nested-checkbox-group">
          <a-checkbox
            v-model:checked="onboardData.user_options.ArithmeticUtilization"
            @change="handleSave"
          >
            Cube及Vector类型指令耗时和占比
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.L2Cache"
            @change="handleSave"
          >
            L2 Cache命中率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.Memory"
            @change="handleSave"
          >
            内存读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.MemoryL0"
            @change="handleSave"
          >
            L0读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.MemoryUB"
            @change="handleSave"
          >
            UB读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.PipeUtilization"
            @change="handleSave"
          >
            计算单元和搬运单元耗时占比
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.ResourceConflictRatio"
            @change="handleSave"
          >
            资源冲突占比
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
.board-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px #424242 solid;
    text-align: left;
    padding: 20px;
  }

  .board-content {
    padding: 20px;
  }

  .board-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
      cursor: pointer;
    }
  }

  .compute-group {
    width: fit-content;
    max-width: 600px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .nested-checkbox-group {
    width: fit-content;
    max-width: 600px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    .ant-checkbox-wrapper {
      display: inline-flex;
      margin-bottom: 0;
    }
  }

  .footer-actions {
    margin-top: 12px;
  }

  .cache-box {
    display: flex;
    align-items: center;
    margin: 12px 0;
  }

  .board-alert-info-content {
    :deep(.ant-alert-icon) {
      position: relative;
      top: -10px;
    }
  }
}
</style>