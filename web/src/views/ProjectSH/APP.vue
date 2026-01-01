<template>
  <a-config-provider :theme="themeConfig">
    <div class="project-sh-container">
      <div class="form-container">
        <div class="section-title">环境配置</div>
        <div class="divider"></div>
        <a-form
          ref="formRef"
          :model="formData"
          :rules="formRules"
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
            <div
              ref="autoCompleteContainer"
              class="auto-complete-wrapper"
            >
              <a-auto-complete
                v-model:value="formData.projectSH"
                :options="projectSHOptions"
                :loading="projectSHLoading"
                placement="bottomLeft"
                :get-popup-container="getPopupContainer"
                placeholder="请输入环境变量.sh文件地址，支持远程搜索"
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
import { ref, reactive, onBeforeUnmount, onMounted } from 'vue';
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
  algorithm: theme.darkAlgorithm, // 使用暗色算法
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
  if (value) return value;

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
    const { type: resultType, list = [] } = result;
    const mapped = list.map((item) => ({ value: item.path }));

    if (resultType === 'projectSH') {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  } catch (error) {
    projectSHLoading.value = false;
    console.error('远程搜索失败:', error);
  }
};

// 提交表单
const handleSubmit = async () => {
  try {
    await formRef.value?.validate();
  } catch (error) {
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
  } catch (error) {
    antdMessage.error('环境变量设置失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  try {
    const projectSH = await getProjectSH();

    formData.projectSH = projectSH;
    // 发送消息给 iframe
    window.postMessage(
      {
        command: 'iframeSetProjectSH',
        data: projectSH,
      },
      '*',
    );
  } catch (error) {
    console.error('获取项目SH失败:', error);
  }
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

    .auto-complete-wrapper {
      position: relative;

      :deep(.ant-select-dropdown) {
        position: absolute !important;
        top: 100% !important;
        left: 0 !important;
        margin-top: 4px;
      }
    }
  }
}
</style>
