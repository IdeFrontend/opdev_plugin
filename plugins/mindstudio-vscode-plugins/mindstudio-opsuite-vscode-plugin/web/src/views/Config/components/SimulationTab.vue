<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { QuestionCircleOutlined } from "@ant-design/icons-vue";

const props = defineProps({
  simulationData: {
    type: Object,
    required: true,
  },
  dataStorageOptions: {
    type: Array,
    default: () => [],
  },
  dataStorageLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:simulationData", "remoteSearch"]);

const handleRemoteSearch = (val) => {
  emit("remoteSearch", val, "simulation");
};

const handleFocus = () => {
  emit("remoteSearch", props.simulationData.dataStoragePath, "simulation");
};
</script>

<template>
  <div class="simulation-tab">
    <div class="config-section">
      <div class="section-title">采集内容</div>
      <a-form layout="vertical">
        <a-form-item>
          <a-checkbox :checked="simulationData.collectionContent.instructionFlow" disabled>
            指令流水图
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox :checked="simulationData.collectionContent.operatorHotspot" disabled>
            算子代码热点图
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="simulationData.collectionContent.memoryThroughput">
            内存通路吞吐率波形图
          </a-checkbox>
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">
        仿真器类型
        <a-tooltip title="帮助内容待定">
          <QuestionCircleOutlined class="help-icon" />
        </a-tooltip>
      </div>
      <a-form layout="vertical">
        <a-form-item>
          <a-select v-model:value="simulationData.simulatorType" style="width: 200px">
            <a-select-option value="Ascend310P3">Ascend310P3</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">控制仿真器dump文件是否生成</div>
      <a-form layout="vertical">
        <a-form-item>
          <a-switch v-model:checked="simulationData.enableDump" />
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">模式</div>
      <a-form layout="vertical">
        <a-form-item>
          <a-checkbox v-model:checked="simulationData.mode.renderInPlatform">
            平台内渲染结果
          </a-checkbox>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="simulationData.mode.downloadToLocal">
            下载数据到本地
          </a-checkbox>
        </a-form-item>
      </a-form>
    </div>

    <div class="config-section">
      <div class="section-title">数据存放位置</div>
      <a-form layout="vertical">
        <a-form-item>
          <a-auto-complete
            v-model:value="simulationData.dataStoragePath"
            :options="dataStorageOptions"
            :loading="dataStorageLoading"
            placeholder="请输入数据存放位置，支持远程搜索"
            @search="handleRemoteSearch"
            @focus="handleFocus"
          />
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<style lang="less" scoped>
.simulation-tab {
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

  :deep(.ant-form-item) {
    margin-bottom: 16px;
  }

  :deep(.ant-checkbox-wrapper) {
    color: rgba(255, 255, 255, 0.85);
  }
}
</style>

