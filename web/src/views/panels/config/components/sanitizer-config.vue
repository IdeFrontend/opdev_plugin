<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, onBeforeMount,
} from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';

import {
  getSanitizerConfigs,
  saveSanitizerForm as saveSanitizerFormAPI,
} from '@web/apis';

const props = defineProps({
  activeConfig: {
    type: String,
    default: '',
  },
});

console.log('props', props);

const form = ref({
  tool: {
    memcheck: true,
    racecheck: false,
    initcheck: false,
    synccheck: false,
  }, // 检测内容
  memcheckOption: {
    'check-unused-memory': false,
    'leak-check': false,
    'check-device-heap': false,
    'check-cann-heap': false,
  }, // 内存检测可选项
  logLevel: 'warn', // 报告输出等级
  maxDebuglogSize: 1024, // 输入日志单个文件大小上限 1 - 10240
  useBlock: false,
  blockId: null, // 单block检测的blockId,0 - 200
});

function isUseBlock() {
  form.value.blockId = null;
  saveSanitizerForm();
}

const activeKey = ref(['config']);

async function loadSanitizerForm() {
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};

  Object.keys(form.value)
    .forEach((key) => {
      if (obj[key] !== undefined) {
        form.value[key] = obj[key];
      }
    });
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data: JSON.parse(JSON.stringify(form.value)) });
}

onBeforeMount(async () => {
  await loadSanitizerForm();
});
</script>

<template>
  <div class="sanitizer-config">
    <a-form
      ref="connectionFormRef"
      :model="form"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      layout="vertical"
    >
      <!-- 报告输出等级 -->
      <a-form-item label="报告输出等级">
        <a-radio-group
          v-model:value="form.logLevel"
          @change="saveSanitizerForm"
        >
          <a-radio value="info">
            info:输出info/warn/error级别的运行信息
          </a-radio>
          <a-radio value="warn">
            warn:输出warn/error级别的运行信息
          </a-radio>
          <a-radio value="error">
            error:输出error级别的运行信息
          </a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item>
        <template #label>
          <span>输出日志中单个文件大小的上限</span>
          <a-tooltip
            title="可设定范围为1~10240之间的整数,单位为MB。默认值为1024。"
          >
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>
        <a-input-number
          v-model:value="form.maxDebuglogSize"
          placeholder="1-10240"
          :max="10240"
          :min="1"
          @change="saveSanitizerForm"
        />
      </a-form-item>

      <a-form-item>
        <template #label>
          <span>检测范围</span>
          <a-tooltip
            title="可设定范围为0~200之间的整数。
启用前
内存检测、未初始化检测和同步检测:默认检测所有block。
竞争检测:核间默认检测所有block,核内默认检测block 0的流水内及流水间的竞争。
启用后
内存检测、未初始化检测和同步检测:检测指定block。
竞争检测:核间不进行检测,检测指定block的流水内及流水间的竞争。"
          >
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>

        <a-radio-group
          v-model:value="form.useBlock"
          @change="isUseBlock"
        >
          <a-radio :value="false">
            全局检测
          </a-radio>
          <a-radio :value="true">
            单block检测
          </a-radio>
        </a-radio-group>

        <a-input-number
          v-if="form.useBlock"
          v-model:value="form.blockId"
          placeholder="0-200"
          :max="200"
          :min="0"
          @change="saveSanitizerForm"
        />
      </a-form-item>
    </a-form>

    <!-- 保存按钮 -->
    <!-- <div class="action-buttons">
      <a-button type="primary" @click="saveSanitizerForm">保存</a-button>
    </div> -->
  </div>
</template>

<style lang="less" scoped>
.sanitizer-config {
  width: 100%;
  color: #ffffff;
  text-align: left;
  font-size: 14px;

  .section-title {
    margin-bottom: 16px;
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(.ant-form) {
    .ant-form-item {
      margin-bottom: 16px;
    }

    .ant-form-item-label > label {
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
    }

    .check-type {
      .check-item-row {
        margin-bottom: 8px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .ant-checkbox-wrapper {
        color: rgba(255, 255, 255, 0.85);
        font-size: 14px;
      }

      .mem-check {
        margin-left: 24px;
        margin-bottom: 8px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px dashed rgba(255, 255, 255, 0.2);
        border-radius: 4px;

        .desc {
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.65);
          font-size: 13px;
          line-height: 1.6;

          &:last-of-type {
            margin-bottom: 0;
          }
        }

        .mem-option {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 8px;

          .ant-checkbox-wrapper {
            color: rgba(255, 255, 255, 0.85);
          }
        }
      }
    }

    .ant-radio-wrapper {
      display: block;
      margin-bottom: 8px;
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
    }

    .ant-input-number {
      width: 200px;
      margin-top: 8px;
    }

    .help-icon {
      margin-left: 4px;
      color: rgba(255, 255, 255, 0.45);
      cursor: help;

      &:hover {
        color: #1668dc;
      }
    }
  }

  :deep(.ant-collapse) {
    background: transparent;
    border: none;

    .ant-collapse-header {
      color: rgba(255, 255, 255, 0.85);
      font-size: 14px;
      padding: 12px 0;

      &:hover {
        color: #1668dc;
      }
    }

    .ant-collapse-content {
      background: transparent;
      border: none;

      .ant-collapse-content-box {
        padding: 16px 0;
      }
    }
  }

  .action-buttons {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    text-align: right;

    .ant-btn {
      min-width: 80px;
    }
  }
}
</style>
