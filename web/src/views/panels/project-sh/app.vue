<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="p-6 h-full flex justify-center items-start bg-transparent"
      :class="actualTheme === 'dark' ? 'text-white/85' : 'text-[#1f1f1f]/85'"
    >
      <div class="w-full max-w-[600px]">
        <div
          class="text-2xl leading-7 font-bold mb-6 text-left"
          :class="actualTheme === 'dark' ? 'text-white' : 'text-[#1f1f1f]'"
        >
          {{ t('web.projectSh.title') }}
        </div>
        <div
          class="h-px"
          :class="actualTheme === 'dark' ? 'bg-white/20' : 'bg-gray-300'"
          style="margin-bottom: 1.5rem;"
        />
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
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import {
  ref, reactive, onMounted,
} from 'vue';
import { t } from 'i18next';
import {
  checkPathExists,
  getProjectSH,
  saveProjectSH,
  remotePathSearch,
} from '@web/apis';
import { selectFile } from '@web/apis/performance-run-data';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { useTheme } from '@web/composables/use-theme';

const {
  themeConfig, actualTheme,
} = useTheme();

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
const formData = reactive({ projectSH: '/etc/profile' });

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
    const selectedPath = await selectFile({ defaultPath: formData.projectSH });

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
    await saveProjectSH({ ascendEnvScript: formData.projectSH });
    // 发送消息给 iframe
    window.postMessage(
      {
        command: 'iframeSetProjectSH',
        data: formData.projectSH,
      },
      '*',
    );
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
    const result = await getProjectSH();
    // result 本身就是 string 类型
    const projectSH = result || '';

    console.log('projectSH', projectSH);

    formData.projectSH = projectSH;
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
    console.error('获取项目SH失败:', error);
  }
});
</script>
