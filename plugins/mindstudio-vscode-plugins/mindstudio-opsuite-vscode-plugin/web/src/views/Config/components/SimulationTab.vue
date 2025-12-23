<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { FolderOutlined } from "@ant-design/icons-vue";
import { ref } from "vue";
import { QuestionCircleOutlined } from "@ant-design/icons-vue";
import { message } from "../../../untils/Message";
import EditTable from "./editTable.vue";
import SelectFolder from "./SelectFolder.vue";

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

const emit = defineEmits(["addAdvancedParam", "deleteAdvancedParam"]);

const saveConfig = () => {
  const obj = { config_id: props.simulationData.config_id, user_options: { ...props.simulationData.user_options } }
  message.sendMessageToParent({ command: "vscodeSaveConfig", data: { type: 'simulate', data: [JSON.parse(JSON.stringify(obj))] } });
};

const activeKey = ref(["1"]);
const guide = ref('https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html')
</script>

<template>
  <div class="simulation-tab">
    <a-form layout="vertical">
      <div class="simulate-title">
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

      <div class="section-title" style="margin-bottom: 8px;">数据存放位置</div>
      <a-form-item>
        <SelectFolder v-model="simulationData.user_options.dataStoragePath" placeholder="请选择数据存放位置" />
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
          <div class="simulate-title" style="margin-bottom: 8px;">
            仿真器类型
            <a-tooltip title="当前支持的仿真器类型可以在 CANN安装路径下 ascend-toolkit/latest/tools/simulator目录查看">
              <QuestionCircleOutlined class="help-icon" />
            </a-tooltip>
          </div>
          <a-form-item>
            <a-input v-model:value="simulationData.user_options.simulatorType" placeholder="请输入仿真器类型"   @change="saveConfig"/>
          </a-form-item>

          <!-- <div class="section-title" style="margin-top: 12px;">控制仿真器dump文件是否生成</div>
          <a-form-item>
            <a-switch v-model:checked="simulationData.user_options.enableDump" @change="saveConfig" />
          </a-form-item> -->

          <div class="section-title" style="margin-top: 12px;">高级参数</div>
          <EditTable :key="updateIndex" :dataSource="simulationData.user_options.advance_param"
            @addTableItem="emit('addAdvancedParam')" @deleteTableItem="emit('deleteAdvancedParam', $event)" />
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
