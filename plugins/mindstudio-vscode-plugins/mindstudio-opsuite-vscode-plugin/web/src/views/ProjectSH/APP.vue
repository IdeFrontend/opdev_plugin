<template>
  <a-config-provider :theme="themeConfig">
    <div class="project-sh-container">
      <div class="form-container">
        <div class="section-title">环境配置</div>
        <div class="divider"></div>
        <a-form
          :model="formData"
          :rules="formRules"
          ref="formRef"
          layout="vertical"
          @submit="handleSubmit"
        >
          <a-form-item name="projectSH">
            <template #label>
              <span>环境变量配置脚本</span>
              <a-tooltip
                title="安装CANN包后需要执行set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径"
              >
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete
              v-model:value="formData.projectSH"
              :options="projectSHOptions"
              :loading="projectSHLoading"
              placement="bottomLeft"
              placeholder="请输入环境变量.sh文件地址，支持远程搜索"
              @search="(val) => remoteSearch('projectSH', val)"
              @focus="() => remoteSearch('projectSH', formData.projectSH)"
            />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" @click="handleSubmit" :loading="submitting">
              确认
            </a-button>
          </a-form-item>
        </a-form>
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref, reactive, onBeforeUnmount,onMounted } from 'vue';
import { message } from '../../untils/Message';
import { checkPathExists } from '@/apis';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { theme } from 'ant-design-vue';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法
};

const formRef = ref<AntdVForm | null>(null);
const projectSHOptions = ref([]);
const projectSHLoading = ref(false);
const submitting = ref(false);

// 表单数据
const formData = reactive({
  projectSH: '/etc/profile',
});

// 表单校验规则
const formRules = {
  projectSH: [
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        const pathExists = await checkPathExists({ path: value, mustFile: true });
        return pathExists ? Promise.resolve() : Promise.reject('脚本文件不存在，请确认');
      },
    },
  ],
};

// 远程搜索
const buildDefaultSearchPath = (value = '') => {
  if (value) return value;
  return '/';
};

const remoteSearch = (type, keyword) => {
  const searchValue = keyword || '';
  if (type === 'projectSH') {
    projectSHLoading.value = true;
  }
  message.sendMessageToParent({
    command: 'vscodeRemotePathSearch',
    type,
    keyword: buildDefaultSearchPath(searchValue.trim()),
  });
};

const getBuildConfigItem = {
  command: 'iframeSetProjectSH',
  callback: (message) => {
    const obj = message.data;
    formData.projectSH = obj;
  },
};

// 监听远程搜索结果
message.addMessageListener({
  command: 'iframeRemoteSearchResult',
  callback: (resp) => {
    const { type, list = [] } = resp.data || {};
    const mapped = list.map((item) => ({ value: item.path }));
    if (type === 'projectSH') {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  },
});
// 提交表单
const handleSubmit = async () => {
  try {
    await formRef.value?.validate();
  } catch (error) {
    return;
  }

  submitting.value = true;
  try {
    message.sendMessageToParent({
      command: 'vscodeSaveProjectSH',
      data: formData.projectSH,
    });
  } catch (error) {
    antdMessage.error('环境变量设置失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  message.addMessageListener(getBuildConfigItem);
  message.sendMessageToParent({ command: 'vscodeGetProjectSH' });
});

onBeforeUnmount(() => {
  message.deleteMessageListener('iframeRemoteSearchResult');
  message.deleteMessageListener('iframeSetProjectSH');
});
</script>

<style scoped lang="less">

.project-sh-container {
  padding: 24px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: transparent;
  color: rgba(255, 255, 255, 0.85);

  .form-container {
    width: 100%;
    max-width: 600px;

    .section-title {
      font-size: 24px;
      line-height: 28px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 24px;
      text-align: left;
    }

    .divider {
      height: 1px;
      background-color: rgba(255, 255, 255, 0.2);
      margin-bottom: 24px;
    }

    :deep(.ant-form-item-label) {
      label {
        color: rgba(255, 255, 255, 0.85);
        display: flex;
        align-items: center;
        gap: 4px;

        .help-icon {
          color: rgba(255, 255, 255, 0.65);
          cursor: help;
          font-size: 14px;
        }
      }
    }

    :deep(.ant-input),
    :deep(.ant-select-selector),
    :deep(.ant-auto-complete .ant-input) {
      background-color: #000000 !important;
      border-color: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.85);

      &:hover {
        border-color: #4ba5f4;
      }

      &:focus {
        border-color: #4ba5f4;
        box-shadow: 0 0 0 2px rgba(75, 165, 244, 0.2);
      }
    }

    :deep(.ant-btn-primary) {
      background-color: #1890ff;
      border-color: #1890ff;

      &:hover {
        background-color: #40a9ff;
        border-color: #40a9ff;
      }
    }
  }
}
</style>
