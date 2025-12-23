<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, computed } from "vue";
import { QuestionCircleOutlined } from "@ant-design/icons-vue";
import editTable from "./editTable.vue";
import { message } from "../../../untils/Message";
import SelectFolder from "./SelectFolder.vue";

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
const advancedCollapseActiveKey = ref(["1"]);

const emit = defineEmits([
  "update:onboardData",
  "remoteSearch",
  "selectAll",
  "memoryAnalysisChange",
  "operatorPerformanceChange",
  "addAdvancedParam",
  "deleteAdvancedParam",
]);

const handleSelectAll = (e) => {
  const checked = typeof e === "boolean" ? e : e.target?.checked ?? false;
  emit("selectAll", checked);
};

const handleMemoryAnalysisChange = (e) => {
  const checked = typeof e === "boolean" ? e : e.target?.checked ?? false;
  emit("memoryAnalysisChange", checked);
};

const handleOperatorPerformanceChange = (e) => {
  const checked = typeof e === "boolean" ? e : e.target?.checked ?? false;
  emit("operatorPerformanceChange", checked);
};

// 所有全选
const totalSelectedAll = ref(true)
// 内存分析图全选
const memorySelectedAll = ref(true)
// 算子性能数据文件全选
const performanceSelectedAll = ref(true)

// 内存分析图，这组半选
const memorySelectedHalf = computed(() => {
  if (props.onboardData.user_options.Occupancy && props.onboardData.user_options.Roofline) {
    return false
  }
  return true
})

// todo 组内选项全部选中时，自动选上“全选”

// 算子性能数据文件，这组半选
const performanceSelectedHalf = computed(() => {
  let count = 0
  const keyArray = ['ArithmeticUtilization', 'L2Cache', 'Memory', 'MemoryL0', 'MemoryUB', 'OpBasicInfo', 'PipeUtilization', 'ResourceConflictRatio']
  keyArray.forEach(key => {
    if (props.onboardData.user_options[key]) {
      count += 1
    }
  })
  return count > 0 && count < keyArray.length
})

// 所有图形半选状态
const totalSelectedHalf = computed(() => {
  let count = 0
  const totalKeys = ['Occupancy', 'Roofline', 'Source', 'MemoryDetail', 'ArithmeticUtilization', 'L2Cache', 'Memory', 'MemoryL0', 'MemoryUB', 'OpBasicInfo', 'PipeUtilization', 'ResourceConflictRatio']
  totalKeys.forEach(key => {
    if (props.onboardData.user_options[key]) {
      count += 1
    }
  })
  return count < totalKeys.length
})

const saveConfig = () => {
  const obj = { config_id: props.onboardData.config_id, user_options: { ...props.onboardData.user_options } }
  message.sendMessageToParent({ command: "vscodeSaveConfig", data: { type: 'on_board', data: [JSON.parse(JSON.stringify(obj))] } });
};
</script>

<template>
  <div class="onboard-tab">
    <div class="config-section">
      <div class="flex-title">
        采集内容
        <a-tooltip :overlay-style="{ maxWidth: '300px' }">
          <template #title>
            <div>
              具体图形案例请参考
              <a :href="guide">算子调优工具概述</a>
            </div>
          </template>
          <QuestionCircleOutlined class="help-icon" />
        </a-tooltip>
      </div>
      <a-form layout="vertical">
        <a-form-item>
          <a-checkbox v-model:checked="totalSelectedAll" :indeterminate="totalSelectedHalf" @change="handleSelectAll">
            全选
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="memorySelectedAll" :indeterminate="memorySelectedHalf"
            @change="handleMemoryAnalysisChange">
            内存分析图
          </a-checkbox>
          <div class="nested-checkbox-group horizontal">
            <a-checkbox v-model:checked="onboardData.user_options.Occupancy" @change="saveConfig">
              核间负载分析图
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.Roofline" @change="saveConfig">
              Roofline瓶颈分析
            </a-checkbox>
            <a-tooltip placeholder="topLeft" title="默认采集">
              <a-checkbox :checked="true" disabled>
                计算工作负载分析
              </a-checkbox>
            </a-tooltip>
            <a-tooltip placeholder="topLeft" title="默认采集">
              <a-checkbox :checked="true" disabled>
                内存负载分析
              </a-checkbox>
            </a-tooltip>
          </div>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="onboardData.user_options.Source">
            算子代码热点图
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="onboardData.user_options.MemoryDetail">
            Cache热力图
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="performanceSelectedAll" :indeterminate="performanceSelectedHalf"
            @change="handleOperatorPerformanceChange">
            算子性能数据文件
          </a-checkbox>
          <div class="nested-checkbox-group horizontal">
            <a-checkbox v-model:checked="onboardData.user_options.ArithmeticUtilization">
              Cube及Vector类型指令耗时和占比
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.L2Cache">
              L2 Cache命中率
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.Memory">
              内存读写带宽速率
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.MemoryL0">
              L0读写带宽速率
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.MemoryUB">
              UB读写带宽速率
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.OpBasicInfo">
              算子基础信息
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.PipeUtilization">
              计算单元和搬运单元耗时占比
            </a-checkbox>
            <a-checkbox v-model:checked="onboardData.user_options.ResourceConflictRatio">
              资源冲突占比
            </a-checkbox>
          </div>
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">模式</div>
      <a-form layout="vertical">
        <a-form-item>
          <a-checkbox v-model:checked="onboardData.user_options.renderInPlatform">
            平台内渲染结果
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="onboardData.user_options.downloadToLocal">
            下载数据到本地
          </a-checkbox>
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">数据存放位置</div>
      <a-form layout="vertical">
        <a-form-item>
          <SelectFolder v-model="onboardData.user_options.dataStoragePath" placeholder="请选择数据存放位置" />
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <a-collapse v-model:activeKey="advancedCollapseActiveKey" ghost>
        <a-collapse-panel key="1" header="高级配置">
          <a-form layout="vertical">
            <a-form-item>
              <a-checkbox v-model:checked="onboardData.user_options.KernelScale">
                使能Kernel侧制定代码段性能采集
                <a-tooltip title="指定代码段范围时，需要在算子Kernel侧对应的代码段前后进行设置，具体设置请参见MetricsProfStart和MetricsProfStop接口">
                  <QuestionCircleOutlined class="help-icon" />
                </a-tooltip>
              </a-checkbox>
            </a-form-item>

            <a-form-item>
              <div class="section-title">高级参数</div>
              <editTable :key="updateIndex" :dataSource="onboardData.user_options.advance_param"
                @addTableItem="emit('addAdvancedParam')" @deleteTableItem="emit('deleteAdvancedParam', $event)" />
            </a-form-item>
          </a-form>
        </a-collapse-panel>
      </a-collapse>
    </div>
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
      cursor: help;
      font-size: 14px;
    }
  }

  .nested-checkbox-group {
    margin-left: 24px;
    margin-top: 8px;
    padding: 12px;
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);

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

  :deep(.ant-form-item) {
    margin-bottom: 16px;
  }

  :deep(.ant-checkbox-wrapper) {
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(.ant-collapse) {
    background-color: transparent;
    border: none;

    .ant-collapse-header {
      color: rgba(255, 255, 255, 0.85);
      padding: 12px 0 !important;
    }

    .ant-collapse-content {
      background-color: transparent;
      border: none;
    }
  }

  :deep(.ant-radio-group) {
    .ant-radio-wrapper {
      color: rgba(255, 255, 255, 0.85);
      margin-right: 16px;

      // .help-icon {
      //   color: rgba(255, 255, 255, 0.45);
      //   cursor: help;
      //   font-size: 14px;
      // }
    }
  }
}
</style>
