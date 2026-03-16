<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup lang="ts">
import {
  ref, reactive, onMounted, inject, computed,
} from 'vue';
import { t } from 'i18next';
import {
  checkPathExists,
  getProjectEnv,
  saveProjectEnv,
  remotePathSearch,
} from '@web/apis';
import { selectFile } from '@web/apis/performance-run-data';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';

const actualTheme = inject('actualTheme', computed(() => 'dark'));

const props = defineProps({
  isStandardCustom: {
    type: Boolean,
    default: false,
  },
});

const formRef = ref<AntdVForm | null>(null);
const autoCompleteContainer = ref<HTMLElement | null>(null);
const projectSHOptions = ref<Array<{ value: string }>>([]);
const projectSHLoading = ref(false);
const submitting = ref(false);

// 获取下拉框容器
const getPopupContainer = (triggerNode: HTMLElement): HTMLElement => {
  return (
    autoCompleteContainer.value || triggerNode.parentElement || document.body
  );
};

// 表单数据
const formData = reactive({ projectSH: '/etc/profile', socVersion: '' });

// 表单校验规则
const formRules = {
  projectSH: [
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }

        const pathExists = await checkPathExists({
          path: value,
          mustFile: true,
        });

        return pathExists
          ? Promise.resolve()
          : Promise.reject(t('web.link.validation.scriptNotExist'));
      },
    },
  ],
};

// 远程搜索
const buildDefaultSearchPath = (value = '') => {
  if (value) {
    return value;
  }

  return '/';
};

const remoteSearch = async (type, keyword) => {
  const searchValue = keyword || '';

  if (type === 'projectSH') {
    projectSHLoading.value = true;
  }

  try {
    const result = await remotePathSearch({
      type,
      keyword: buildDefaultSearchPath(searchValue.trim()),
    });
    const {
      type: resultType, list = [],
    } = result;
    const mapped = list.map((item) => ({ value: item.path }));

    if (resultType === 'projectSH') {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  }
  catch (error) {
    projectSHLoading.value = false;
    console.error('远程搜索失败:', error);
  }
};

// 选择文件
const handleSelectFile = async () => {
  try {
    const selectedPath = await selectFile({
      defaultPath: formData.projectSH,
    });
    if (selectedPath) {
      formData.projectSH = selectedPath;
    }
  }
  catch (error) {
    console.error('选择文件失败:', error);
    antdMessage.error(t('web.link.selectFileFailed'));
  }
};

// 提交表单
const handleSubmit = async () => {
  try {
    await formRef.value?.validate();
  }
  catch {
    return;
  }

  submitting.value = true;

  try {
    await saveProjectEnv({ 
      ascendEnvScript: formData.projectSH, 
      socVersion: formData.socVersion 
    });
    // 发送消息给 iframe
    window.postMessage(
      {
        command: 'iframeSetProjectSH',
        data: formData.projectSH,
      },
      '*',
    );
    antdMessage.success(t('web.config.env.saveSuccess'));
  }
  catch {
    antdMessage.error(t('web.config.env.saveFailed'));
  }
  finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  try {
    const result = await getProjectEnv();
    const projectSH = result?.ascendEnvScript || '';
    const socVersion = result?.socVersion || '';

    console.log('projectSH', projectSH);
    console.log('socVersion', socVersion);

    formData.projectSH = projectSH;
    formData.socVersion = socVersion;
    // 发送消息给 iframe
    window.postMessage(
      {
        command: 'iframeSetProjectSH',
        data: projectSH,
      },
      '*',
    );
  }
  catch (error) {
    console.error('获取项目环境配置失败:', error);
  }
});
</script>

<template>
  <div class="env-config" :class="actualTheme === 'dark' ? 'theme-dark' : 'theme-light'">
    <a-form
      ref="formRef"
      :model="formData"
      :rules="formRules as any"
      layout="vertical"
      @submit="handleSubmit"
    >
      <a-form-item
        name="projectSH"
        class="[&_.ant-form-item-label_label]:flex [&_.ant-form-item-label_label]:items-center [&_.ant-form-item-label_label]:gap-1"
      >
        <template #label>
          <span>{{ t('web.link.envScriptLabel') }}</span>
          <a-tooltip :title="t('web.link.envScriptTooltip')">
            <QuestionCircleOutlined
              class="cursor-help text-sm"
            />
          </a-tooltip>
        </template>
        <div
          ref="autoCompleteContainer"
          class="relative"
        >
          <a-auto-complete
            v-model:value="formData.projectSH"
            :options="projectSHOptions"
            :loading="projectSHLoading"
            placement="bottomLeft"
            :get-popup-container="getPopupContainer"
            :placeholder="t('web.link.envScriptPlaceholder')"
            @search="(val) => remoteSearch('projectSH', val)"
            @focus="handleSelectFile"
          />
        </div>
      </a-form-item>
      <a-form-item
        v-if="props.isStandardCustom"
        name="socVersion"
        class="[&_.ant-form-item-label_label]:flex [&_.ant-form-item-label_label]:items-center [&_.ant-form-item-label_label]:gap-1"
      >
        <template #label>
          <span>SOC版本</span>
          <a-tooltip
            title="项目的SOC版本配置，常用soc版本：ascend10b, ascend950等"
          >
            <QuestionCircleOutlined
              class="cursor-help text-sm"
            />
          </a-tooltip>
        </template>
        <a-input
          v-model:value="formData.socVersion"
          placeholder="请输入SOC版本"
        />
      </a-form-item>
      <a-form-item>
        <a-button
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
        >
          {{ t('web.config.env.confirm') }}
        </a-button>
      </a-form-item>
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.env-config {
  width: 100%;
  text-align: left;
  font-size: 14px;

  // 深色主题
  &.theme-dark {
    color: #ffffff;
  }

  // 浅色主题
  &.theme-light {
    color: #1f1f1f;
  }
}
</style>
