<template>
  <a-config-provider :theme="themeConfig">
    <div
      class="p-6 h-full flex justify-center items-start bg-transparent text-white/85"
    >
      <div class="w-full max-w-[600px]">
        <div class="text-2xl leading-7 font-bold text-white mb-6 text-left">
          环境配置
        </div>
        <div class="h-px bg-white/20 mb-6" />
        <a-form
          ref="formRef"
          :model="formData"
          :rules="formRules as any"
          layout="vertical"
          @submit="handleSubmit"
        >
          <a-form-item
            name="projectSH"
            class="[&_label]:!text-white/85 [&_.ant-form-item-label_label]:flex [&_.ant-form-item-label_label]:items-center [&_.ant-form-item-label_label]:gap-1"
          >
            <template #label>
              <span>环境变量配置脚本</span>
              <a-tooltip
                title="安装CANN包后需要执行set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径"
              >
                <QuestionCircleOutlined
                  class="text-white/65 cursor-help text-sm"
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
                placeholder="请输入环境变量.sh文件地址，支持远程搜索"
                class="[&_.ant-input]:!bg-black [&_.ant-input]:!border-white/20 [&_.ant-input]:!text-white/85 hover:[&_.ant-input]:!border-[#4ba5f4] focus:[&_.ant-input]:!border-[#4ba5f4] focus:[&_.ant-input]:!shadow-[0_0_0_2px_rgba(75,165,244,0.2)]"
                @search="(val) => remoteSearch('projectSH', val)"
                @focus="() => remoteSearch('projectSH', formData.projectSH)"
              />
            </div>
          </a-form-item>
          <a-form-item>
            <a-button
              type="primary"
              :loading="submitting"
              @click="handleSubmit"
            >
              确认
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
import {
  checkPathExists,
  getProjectSH,
  saveProjectSH,
  remotePathSearch,
} from '@/apis';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { theme } from 'ant-design-vue';

const themeConfig = {
  // 使用暗色算法
  algorithm: theme.darkAlgorithm,
};

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
          : Promise.reject('脚本文件不存在，请确认');
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
    await saveProjectSH({ accendEnvScript: formData.projectSH });
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
    antdMessage.error('环境变量设置失败');
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
