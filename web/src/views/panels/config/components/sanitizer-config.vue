<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, onBeforeMount, inject, computed,
} from 'vue';
import { t } from 'i18next';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';

import {
  getSanitizerConfigs,
  saveSanitizerForm as saveSanitizerFormAPI,
} from '@web/apis';

const actualTheme = inject('actualTheme', computed(() => 'dark'));

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
  <div class="sanitizer-config" :class="actualTheme === 'dark' ? 'theme-dark' : 'theme-light'">
    <a-form
      ref="connectionFormRef"
      :model="form"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      layout="vertical"
    >
      <a-form-item :label="t('web.config.sanitizer.logLevel')">
        <a-radio-group
          v-model:value="form.logLevel"
          @change="saveSanitizerForm"
        >
          <a-radio value="info">
            {{ t('web.config.sanitizer.logLevelInfo') }}
          </a-radio>
          <a-radio value="warn">
            {{ t('web.config.sanitizer.logLevelWarn') }}
          </a-radio>
          <a-radio value="error">
            {{ t('web.config.sanitizer.logLevelError') }}
          </a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item>
        <template #label>
          <span>{{ t('web.config.sanitizer.maxLogSize') }}</span>
          <a-tooltip :title="t('web.config.sanitizer.maxLogSizeTooltip')">
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
          <span>{{ t('web.config.sanitizer.scope') }}</span>
          <a-tooltip :title="t('web.config.sanitizer.scopeTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>

        <a-radio-group
          v-model:value="form.useBlock"
          @change="isUseBlock"
        >
          <a-radio :value="false">
            {{ t('web.config.sanitizer.scopeGlobal') }}
          </a-radio>
          <a-radio :value="true">
            {{ t('web.config.sanitizer.scopeBlock') }}
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
  text-align: left;
  font-size: 14px;

  .section-title {
    margin-bottom: 16px;
    font-size: 16px;
    font-weight: 500;
  }

  // 深色主题
  &.theme-dark {
    color: #ffffff;

    .section-title {
      color: rgba(255, 255, 255, 0.85);
    }
  }

  // 浅色主题
  &.theme-light {
    color: #1f1f1f;

    .section-title {
      color: rgba(0, 0, 0, 0.85);
    }
  }

  :deep(.ant-form) {
    .ant-form-item {
      margin-bottom: 16px;
    }

    .ant-form-item-label > label {
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
        font-size: 14px;
      }
    }

    .ant-radio-wrapper {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .ant-input-number {
      width: 200px;
      margin-top: 8px;
    }

    .help-icon {
      margin-left: 4px;
      cursor: help;
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
