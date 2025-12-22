<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref } from "vue";
import { QuestionCircleOutlined } from "@ant-design/icons-vue";
import { message } from "../../../untils/Message";

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

const saveConfig = () => {
  // 构造user_options
  const obj = { config_id: props.simulationData.config_id, user_options: { ...props.simulationData.user_options } }
  message.sendMessageToParent({ command: "vscodeSaveConfig", data: { type: 'simulate', data: [obj] } });
};

const activeKey = ref(["1"]);
</script>

<template>
  <div class="simulation-tab">
    <a-form layout="vertical">
      <div class="section-title">采集内容</div>
      <a-form-item>
        <a-tooltip placeholder="topLeft" title="默认采集">
          <a-checkbox :checked="true" disabled>
            指令流水图
          </a-checkbox>
        </a-tooltip>
      </a-form-item>
      <a-form-item>
        <a-tooltip placeholder="topLeft" title="默认采集">
          <a-checkbox :checked="true" disabled>
            算子代码热点图
          </a-checkbox>
        </a-tooltip>
      </a-form-item>
      <a-form-item>
        <a-checkbox v-model:checked="simulationData.user_options.PMSampling" @change="saveConfig">
          内存通路吞吐率波形图
        </a-checkbox>
      </a-form-item>

      <div class="section-title" style="margin-top: 12px;">模式</div>
      <a-form-item>
        <a-checkbox v-model:checked="simulationData.user_options.downloadToLocal" @change="saveConfig">
          下载数据到本地
        </a-checkbox>
      </a-form-item>

      <div class="section-title">数据存放位置</div>
      <a-form-item>
        <a-auto-complete v-model:value="simulationData.user_options.dataStoragePath" :options="dataStorageOptions"
          :loading="dataStorageLoading" placeholder="请输入数据存放位置，支持远程搜索" @search="handleRemoteSearch"
          @focus="handleFocus" />
      </a-form-item>

      <a-form-item>
        <a-tooltip placeholder="topLeft" title="暂不支持，敬请期待">
          <a-checkbox :checked="false" disabled>
            平台内渲染结果
          </a-checkbox>
        </a-tooltip>
      </a-form-item>

      <a-collapse v-model:activeKey="activeKey" ghost>
        <a-collapse-panel key="1" header="高级配置">
          <div class="section-title" style="margin-bottom: 8px;">
            仿真器类型
            <a-tooltip title="帮助内容待定">
              <QuestionCircleOutlined class="help-icon" />
            </a-tooltip>
          </div>
          <a-form-item>
            <a-input v-model:value="simulationData.user_options.simulatorType" placeholder="请输入仿真器类型" />
          </a-form-item>

          <div class="section-title" style="margin-top: 12px;">控制仿真器dump文件是否生成</div>
          <a-form-item>
            <a-switch v-model:checked="simulationData.user_options.enableDump" />
          </a-form-item>
        </a-collapse-panel>
      </a-collapse>
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.simulation-tab {
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
