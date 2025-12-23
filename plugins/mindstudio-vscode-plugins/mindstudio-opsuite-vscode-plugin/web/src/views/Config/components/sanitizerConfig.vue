<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, onBeforeMount } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';

import { message } from "../../../untils/Message";

const props = defineProps({
  activeConfig: {
    type: String,
    default: "",
  },
});

const form = ref({
  tool: { memcheck: true, racecheck: false, initcheck: false, synccheck: false }, // 检测内容
  memcheckOption: { 'check-unused-memory': false, 'leak-check': false, 'check-device-heap': false, 'check-cann-heap': false }, // 内存检测可选项
  logLevel: 'warn', // 报告输出等级
  maxDebuglogSize: 1024, // 输入日志单个文件大小上限 1 - 10240
  useBlock: false,
  blockId: null, // 单block检测的blockId，0 - 200
})
function isUseBlock(val) {
  form.value.blockId = null;
}

const activeKey = ref(['config']);

const getSanitizerForm = {
  command: 'iframeSetSanitizerForm',
  callback: (message) => {
    console.log('message.data config', message.data)
    const obj = JSON.parse(message.data || '{}')?.user_options || {}
    Object.keys(form.value).forEach(key => {
      if (obj[key] !== undefined) {
        form.value[key] = obj[key]
      }
    })
  }
}


function saveSanitizerForm() {
  message.sendMessageToParent({
    command: "vscodeSaveSanitizerForm", data: JSON.parse(JSON.stringify(form.value))
  });
}

onBeforeMount(() => {
  message.addMessageListener(getSanitizerForm)
  message.sendMessageToParent({ command: 'vscodeGetSanitizerForm' });
})
</script>

<template>
  <div class="sanitizer-config">
    <div class="model-title">检测内容</div>
    <a-form :model="buildConfigForme" :label-col="{ span: 6 }" :wrapper-col="{ span: 24 }" ref="connectionFormRef"
      layout="vertical">
      <a-form-item class="check-type">
        <a-checkbox v-model:checked="form.tool.memcheck">内存检测</a-checkbox>
        <div v-if="form.tool.memcheck" class="mem-check">
          <div class="desc">基础检测：默认会开启非法读写、多核踩踏、非对齐访问和非法释放</div>
          <div class="desc">可选检测：</div>
          <div class="desc mem-option">
            <a-checkbox v-model:checked="form.memcheckOption['leak-check']">内存泄漏</a-checkbox>
            <a-checkbox v-model:checked="form.memcheckOption['check-unused-memory']">分配内存未使用</a-checkbox>
            <a-checkbox v-model:checked="form.memcheckOption['check-device-heap']">Device侧内存检测</a-checkbox>
            <a-checkbox v-model:checked="form.memcheckOption['check-cann-heap']">CANN软件栈内存检测</a-checkbox>
          </div>
        </div>
        <a-checkbox v-model:checked="form.tool.racecheck">竞争检测</a-checkbox>
        <a-checkbox v-model:checked="form.tool.initcheck">未初始化检测</a-checkbox>
        <a-checkbox v-model:checked="form.tool.synccheck">同步检测</a-checkbox>
      </a-form-item>
      <a-form-item label="报告输出等级">
        <a-radio-group v-bind:value="form.logLevel">
          <a-radio value="info">info：输出info/warn/error级别的运行信息</a-radio>
          <a-radio value="warn">warn：输出warn/error级别的运行信息</a-radio>
          <a-radio value="error">error：输出error级别的运行信息</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-collapse v-model:activeKey="activeKey" ghost>
        <a-collapse-panel key="config" header="高级配置">

          <a-form-item>
            <template #label>
              输出日志中单个文件大小的上限
              <a-tooltip title="可设定范围为1~10240之间的整数，单位为MB。默认值为1024。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-input-number v-model:value="form.maxDebuglogSize" placeholder="1-10240" :max="10240"
              :min="1"></a-input-number>
          </a-form-item>

          <a-form-item>
            <template #label>
              检测范围
              <a-tooltip title="可设定范围为0~200之间的整数。
启用前
内存检测、未初始化检测和同步检测：默认检测所有block。
竞争检测：核间默认检测所有block，核内默认检测block 0的流水内及流水间的竞争。
启用后
内存检测、未初始化检测和同步检测：检测指定block。
竞争检测：核间不进行检测，检测指定block的流水内及流水间的竞争。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>

            <a-radio-group v-bind:value="form.useBlock" @change="isUseBlock">
              <a-radio :value="false">全局检测</a-radio>
              <a-radio :value="true">单block检测</a-radio>
            </a-radio-group>

            <a-input-number v-if="form.useBlock" v-model:value="form.maxDebuglogSize" placeholder="1-200" :max="200"
              :min="1"></a-input-number>
          </a-form-item>
        </a-collapse-panel>
      </a-collapse>
    </a-form>

    <a-button @click="saveSanitizerForm">保存</a-button>
  </div>
</template>

<style lang="less">
.sanitizer-config {
  :deep(.a-form) {
    .check-type {
      display: flex;
      flex-direction: column;
    }
  }
}
</style>