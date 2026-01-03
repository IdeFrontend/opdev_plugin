<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import editTable from './edit-table.vue';
import { saveConfig as saveConfigAPI } from '@/apis';
import SelectFolder from './select-folder.vue';

const props = defineProps({
  onboardData: {
    type: Object,
    required: true,
  },
  updateIndex: {
    type: Number,
    default: 1,
  },
});

// Advanced collapse panel - default open
const advancedCollapseActiveKey = ref(['1']);

const emit = defineEmits([
  'selectAll',
  'memoryAnalysisChange',
  'operatorPerformanceChange',
  'addAdvancedParam',
  'deleteAdvancedParam',
]);

const addTableItem = () => {
  emit('addAdvancedParam');
  nextTick(() => {
    saveConfig();
  });
};

const deleteTableItem = (e) => {
  console.log('delete event', e);
  emit('deleteAdvancedParam', e);
  nextTick(() => {
    saveConfig();
  });
};

const handleSelectAll = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('selectAll', checked);
  nextTick(() => {
    saveConfig();
  });
};

const handleMemoryAnalysisChange = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('memoryAnalysisChange', checked);
  nextTick(() => {
    saveConfig();
  });
};

const handleOperatorPerformanceChange = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('operatorPerformanceChange', checked);
  nextTick(() => {
    saveConfig();
  });
};

// 所有全选
const totalSelectedAll = ref(true);
// 内存分析图全选
const memorySelectedAll = ref(true);
// 算子性能数据文件全选
const performanceSelectedAll = ref(true);

// 内存分析图，这组半选
const memorySelectedHalf = computed(() => {
  if (
    props.onboardData.user_options.Occupancy &&
    props.onboardData.user_options.Roofline
  ) {
    return false;
  }

  return true;
});

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
    if (props.onboardData.user_options[key]) {
      count += 1;
    }
  });

  return count > 0 && count < keyArray.length;
});

// 所有图形半选状态
const totalSelectedHalf = computed(() => {
  let count = 0;
  const totalKeys = [
    'Occupancy',
    'Roofline',
    'Source',
    'MemoryDetail',
    'ArithmeticUtilization',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'PipeUtilization',
    'ResourceConflictRatio',
  ];

  totalKeys.forEach((key) => {
    if (props.onboardData.user_options[key]) {
      count += 1;
    }
  });

  return count < totalKeys.length;
});

const saveConfig = async () => {
  const obj = {
    config_id: props.onboardData.config_id,
    user_options: { ...props.onboardData.user_options },
  };

  await saveConfigAPI({
    type: 'on_board',
    data: [JSON.parse(JSON.stringify(obj))],
  });
};

// 组内选项全部选中时，自动选上“全选”
watch(
  () => props.onboardData.user_options,
  () => {
    memorySelectedAll.value =
      props.onboardData.user_options.Occupancy &&
      props.onboardData.user_options.Roofline;

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
      if (props.onboardData.user_options[key]) {
        count += 1;
      }
    });
    performanceSelectedAll.value = count === keyArray.length;

    totalSelectedAll.value =
      memorySelectedAll.value &&
      performanceSelectedAll.value &&
      props.onboardData.user_options.Source &&
      props.onboardData.user_options.MemoryDetail;
  },
  { deep: true, immediate: true },
);

const startHref =
  'https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1214.html';
const stopHref =
  'https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1215.html';
const guide =
  'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';
</script>

<template>
  <div class="onboard-tab">
    <a-form layout="vertical">
      <div class="flex-title">
        采集内容
        <a-tooltip :overlay-style="{ maxWidth: '300px' }">
          <template #title>
            <div>
              具体图形案例请参考算子调优工具概述:
              <br />
              {{ guide }}
            </div>
          </template>
          <QuestionCircleOutlined class="help-icon" />
        </a-tooltip>
      </div>

      <a-form-item v-if="false">
        <a-checkbox
          v-model:checked="totalSelectedAll"
          :indeterminate="totalSelectedHalf"
          @change="handleSelectAll"
        >
          全选
        </a-checkbox>
      </a-form-item>
      <a-form-item>
        <a-checkbox
          v-if="false"
          v-model:checked="memorySelectedAll"
          :indeterminate="memorySelectedHalf"
          @change="handleMemoryAnalysisChange"
        >
          内存分析图
        </a-checkbox>
        <div>计算内存热力图（默认采集）</div>
        <div class="checkbox-group">
          <div style="margin-bottom: 12px">
            默认采集：基础信息、计算工作负载分析、内存负载分析
          </div>
          <span>默认选项：</span>
          <a-checkbox
            v-model:checked="onboardData.user_options.Occupancy"
            @change="saveConfig"
          >
            核间负载分析图
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.Roofline"
            @change="saveConfig"
          >
            Roofline瓶颈分析
          </a-checkbox>
          <a-tooltip title="若勾选该选项，将默认采集所有算子性能指标">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </div>
      </a-form-item>
      <a-form-item>
        <a-checkbox
          v-model:checked="onboardData.user_options.Source"
          @change="saveConfig"
        >
          算子代码热点图
        </a-checkbox>
      </a-form-item>
      <a-form-item>
        <a-checkbox
          v-model:checked="onboardData.user_options.MemoryDetail"
          @change="saveConfig"
        >
          Cache热力图
        </a-checkbox>
        <a-tooltip title="若勾选该选项，将默认采集所有算子性能指标">
          <QuestionCircleOutlined class="help-icon" />
        </a-tooltip>
      </a-form-item>
      <a-form-item>
        <a-checkbox
          v-model:checked="performanceSelectedAll"
          :indeterminate="performanceSelectedHalf"
          @change="handleOperatorPerformanceChange"
        >
          算子性能指标
        </a-checkbox>
        <div class="nested-checkbox-group horizontal">
          <a-checkbox
            v-model:checked="onboardData.user_options.ArithmeticUtilization"
            @change="saveConfig"
          >
            Cube及Vector类型指令耗时和占比
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.L2Cache"
            @change="saveConfig"
          >
            L2 Cache命中率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.Memory"
            @change="saveConfig"
          >
            内存读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.MemoryL0"
            @change="saveConfig"
          >
            L0读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.MemoryUB"
            @change="saveConfig"
          >
            UB读写带宽速率
          </a-checkbox>
          <a-checkbox
            v-if="false"
            v-model:checked="onboardData.user_options.BasicInfo"
            @change="saveConfig"
          >
            算子基础信息
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.PipeUtilization"
            @change="saveConfig"
          >
            计算单元和搬运单元耗时占比
          </a-checkbox>
          <a-checkbox
            v-model:checked="onboardData.user_options.ResourceConflictRatio"
            @change="saveConfig"
          >
            资源冲突占比
          </a-checkbox>
        </div>
      </a-form-item>
      <a-alert
        v-if="
          onboardData.user_options.Roofline ||
          onboardData.user_options.MemoryDetail
        "
        type="info"
        show-icon
        message="若勾选“Roofline瓶颈分析”或“Cache热力图”，将默认采集所有算子性能指标"
        style="margin-top: 12px"
      ></a-alert>

      <!-- <div class="section-title" style="margin-top: 12px;">模式</div>
      <a-form-item>
        <a-tooltip placeholder="topLeft" title="暂不支持，敬请期待">
          <a-checkbox :checked="false" disabled>
            平台内渲染结果
          </a-checkbox>
        </a-tooltip>
      </a-form-item>
      <a-form-item>
        <a-checkbox v-model:checked="onboardData.user_options.downloadToLocal" @change="saveConfig">
          下载数据到本地
        </a-checkbox>
      </a-form-item>
      <div class="section-title" style="margin-bottom: 8px;">数据存放位置</div>
      <a-form-item>
        <SelectFolder v-model="onboardData.user_options.dataStoragePath" placeholder="请选择数据存放位置" />
      </a-form-item> -->

      <a-collapse
        v-model:active-key="advancedCollapseActiveKey"
        ghost
      >
        <a-collapse-panel
          key="1"
          header="高级配置"
        >
          <a-form-item>
            <a-checkbox
              v-model:checked="onboardData.user_options.KernelScale"
              @change="saveConfig"
            >
              使能Kernel侧指定代码段性能采集
              <a-tooltip>
                <QuestionCircleOutlined class="help-icon" />
                <template #title>
                  <div>
                    指定代码段范围时，需要在算子Kernel侧对应的代码段前后调用MetricsProfStart和MetricsProfStop接口，具体调用方式请参见MetricsProfStart和MetricsProfStop接口
                  </div>
                </template>
              </a-tooltip>
            </a-checkbox>
          </a-form-item>
          <a-alert
            v-if="onboardData.user_options.KernelScale"
            type="info"
            show-icon
          >
            <template #message>
              请确认是否在算子Kernal侧对应的代码段前后调用了MetricsProfStart和MetricsProfStop接口，若未调用，该选项将不会生效。
              具体调用方式请参见
              <br />
              MetricsProfStart
              <br />
              （{{ startHref }}）
              <br />
              和MetricsProfStop接口
              <br />
              （{{ stopHref }}）
            </template>
          </a-alert>

          <a-form-item>
            <editTable
              :key="updateIndex"
              :data-source="onboardData.user_options.advance_param"
              @add-table-item="addTableItem"
              @delete-table-item="deleteTableItem"
              @on-change="saveConfig"
            />
          </a-form-item>
        </a-collapse-panel>
      </a-collapse>
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.onboard-tab {
  .flex-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
    }
  }

  .config-section {
    margin-bottom: 24px;

    .section-title {
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .help-icon {
      color: rgba(255, 255, 255, 0.45);
      // cursor: help;
      font-size: 14px;
    }
  }

  .nested-checkbox-group {
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    max-width: 600px;
    width: fit-content;

    .ant-checkbox-wrapper {
      display: block;
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    &.horizontal {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;

      .ant-checkbox-wrapper {
        display: inline-flex;
        margin-bottom: 0;
      }
    }
  }

  .checkbox-group {
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    max-width: 600px;
    width: fit-content;

    .ant-checkbox-wrapper {
      display: inline-flex;
      margin-bottom: 0;
    }
  }

  :deep(.ant-checkbox-wrapper) {
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(.ant-form-item) {
    margin-bottom: 0;
  }

  :deep(.ant-collapse-header) {
    padding-left: 0;
    padding-right: 0;
  }

  :deep(.ant-collapse-content-box) {
    padding: 0;
    padding-block: unset !important;
  }
}
</style>
