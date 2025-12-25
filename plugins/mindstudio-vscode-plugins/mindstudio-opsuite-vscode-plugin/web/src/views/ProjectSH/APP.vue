<template>
  <div class="project-sh-container">
    <div class="form-container">
      <div class="section-title">设置环境变量</div>
      <a-form
        :model="formData"
        :rules="formRules"
        ref="formRef"
        layout="vertical"
        @submit="handleSubmit"
      >
        <a-form-item name="projectSH" label="环境变量配置脚本">
          <a-auto-complete
            v-model:value="formData.projectSH"
            :options="projectSHOptions"
            :loading="projectSHLoading"
            placeholder="请输入环境变量.sh文件地址"
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
</template>

<script setup lang="ts">
import { ref, reactive, onBeforeUnmount,onMounted } from 'vue';
import { message } from '../../untils/Message';
import { checkPathExists } from '@/apis';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';

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
  // projectSH: [
  //   {
  //     trigger: 'blur',
  //     validator: async (rule, value) => {
  //       if (!value) {
  //         return Promise.resolve();
  //       }
  //       const pathExists = await checkPathExists({ path: value, mustFile: true });
  //       return pathExists ? Promise.resolve() : Promise.reject('脚本文件不存在，请确认');
  //     },
  //   },
  // ],
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
    console.log('获取iframeSetProjectSH');
    const obj = message.data || '/home/developer';
    formData.projectSH = obj;
  },
}
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
    antdMessage.success('环境变量设置成功');
  } catch (error) {
    antdMessage.error('环境变量设置失败');
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  message.addMessageListener(getBuildConfigItem);
  message.sendMessageToParent({ command: 'vscodeGetHome' });
});

onBeforeUnmount(() => {
  message.deleteMessageListener('iframeRemoteSearchResult');
});
</script>

<style scoped lang="less">
.project-sh-container {
  padding: 24px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: rgb(20, 20, 20);
  color: rgba(255, 255, 255, 0.85);

  .form-container {
    width: 100%;
    max-width: 600px;

    .section-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 24px;
    }

    :deep(.ant-form-item-label) {
      label {
        color: rgba(255, 255, 255, 0.85);
      }
    }

    :deep(.ant-input) {
      background-color: rgba(255, 255, 255, 0.1);
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
      background-color: #4ba5f4;
      border-color: #4ba5f4;

      &:hover {
        background-color: #6bb5ff;
        border-color: #6bb5ff;
      }
    }
  }
}
</style>
