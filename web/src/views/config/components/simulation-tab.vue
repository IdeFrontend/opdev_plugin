<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, nextTick, watch,
} from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  saveConfig as saveConfigAPI, openExternalLink,
} from '@/apis';
import EditTable from './edit-table.vue';

const props = defineProps({
  simulationData: {
    type: Object,
    required: true,
  },
  updateIndex: {
    type: Number,
    default: 1,
  },
});

const localSimulationData = ref({});

watch(
  () => props.simulationData,
  (val) => {
    localSimulationData.value = { ...val };
  },
  {
    immediate: true,
    deep: true,
  },
);

const emit = defineEmits([
  'addAdvancedParam',
  'deleteAdvancedParam',
  'update:simulationData',
]);

console.log('emit', emit);

const handleSimulationDataChange = () => {
  emit('update:simulationData', localSimulationData.value);
  saveConfig();
};

const saveConfig = async () => {
  const obj = {
    config_id: localSimulationData.value.config_id,
    user_options: { ...localSimulationData.value.user_options },
  };

  await saveConfigAPI({
    type: 'simulate',
    data: [JSON.parse(JSON.stringify(obj))],
  });
};

const activeKey = ref(['1']);
const guide = ref('https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html');

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

const jumpToGuide = () => {
  openExternalLink(guide.value);
};
</script>

<template>
  <div class="simulation-tab">
    <a-form layout="vertical">
      <div class="simulate-title">
        采集内容
        <a-tooltip :overlay-style="{ maxWidth: '300px' }">
          <template #title>
            <div>
              具体图形案例请参考<span
                style="color: #1677ff; cursor: pointer;"
                @click="jumpToGuide"
              >算子调优工具概述</span>
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
        <a-checkbox
          v-model:checked="localSimulationData.user_options.PMSampling"
          @change="handleSimulationDataChange"
        >
          内存通路吞吐率波形子图
        </a-checkbox>
      </div>

      <div style="margin-top: 12px">
        算子代码热点图（默认采集）
      </div>
      <div class="nested-checkbox-group">
        附加选项：
        <a-checkbox
          v-model:checked="localSimulationData.user_options.ResourceConflictRatio"
          @change="handleSimulationDataChange"
        >
          资源冲突占比指标
        </a-checkbox>
      </div>

      <a-collapse
        v-model:active-key="activeKey"
        ghost
      >
        <a-collapse-panel
          key="1"
          header="高级配置"
        >
          <div
            class="simulate-title"
            style="margin-bottom: 8px"
          >
            仿真器类型
            <a-tooltip
              title="当前支持的仿真器类型可以在 CANN安装路径下 ascend-toolkit/latest/tools/simulator目录查看"
            >
              <QuestionCircleOutlined class="help-icon" />
            </a-tooltip>
          </div>
          <a-form-item>
            <a-input
              v-model:value="localSimulationData.user_options.simulatorType"
              placeholder="请输入仿真器类型"
              @change="handleSimulationDataChange"
            />
          </a-form-item>

          <EditTable
            :key="updateIndex"
            class="add-params"
            :data-source="localSimulationData.user_options.advance_param"
            @add-table-item="addTableItem"
            @delete-table-item="deleteTableItem"
            @on-change="handleSimulationDataChange"
          />
        </a-collapse-panel>
      </a-collapse>
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.simulation-tab {
  .simulate-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
    }
  }

  .add-params {
    margin-top: 12px;
  }

  .nested-checkbox-group {
    // margin-left: 24px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    max-width: 600px;
    width: fit-content;

    .ant-checkbox-wrapper {
      // display: block;
      // margin-bottom: 8px;
      display: inline-flex;
      margin-bottom: 0;

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
