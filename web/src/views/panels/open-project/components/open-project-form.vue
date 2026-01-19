<script setup lang="ts">
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { useOpenProject } from '../composables/use-open-project';
import { OpenProjectFormRulesFactory } from '../composables/form-rules';

// 使用 composable 获取业务逻辑
const {
  connectionFormRef,
  projectFormData,
  projectPathOptions,
  projectPathLoading,
  projectSHOptions,
  projectSHLoading,
  remoteSearch,
  handleOpenProject,
} = useOpenProject();

const connectionFormRules = OpenProjectFormRulesFactory.createFormRules();
</script>
<template>
  <div
    class="text-left text-sm font-normal leading-[22px] [&_.ant-form-item-label_.help-icon]:text-white/45 [&_.ant-form-item-label_.help-icon]:cursor-help [&_.ant-form-item-label_.help-icon]:text-sm [&_.ant-form-item-label_.help-icon]:ml-1">
    <a-form ref="connectionFormRef" :model="projectFormData" :label-col="{ span: 6 }" :wrapper-col="{ span: 24 }"
      :rules="connectionFormRules as any" layout="vertical">
      <a-form-item name="projectPath">
        <template #label>
          <span>算子工程位置</span>
          <a-tooltip title="您要打开的算子工程的存储路径。">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>
        <a-auto-complete v-model:value="projectFormData.projectPath" :options="projectPathOptions"
          :loading="projectPathLoading" placeholder="请输入工程位置，支持远程搜索"
          @search="(val) => remoteSearch('projectPath', val)" @focus="
            () => remoteSearch('projectPath', projectFormData.projectPath)
          " />
      </a-form-item>
      <a-form-item name="projectSH">
        <template #label>
          <span>环境变量配置脚本</span>
          <a-tooltip
            title="安装CANN包后需要执行的set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径。">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>
        <a-auto-complete v-model:value="projectFormData.projectSH" :options="projectSHOptions"
          :loading="projectSHLoading" placeholder="请输入环境变量.sh文件地址，支持远程搜索"
          @search="(val) => remoteSearch('projectSH', val)" @focus="
            () => remoteSearch('projectSH', projectFormData.projectSH)
          " />
      </a-form-item>
    </a-form>
    <a-button type="primary" class="!mt-6 !w-[84px] !h-8 !rounded-none" style="float: right;" @click="handleOpenProject">
      立即打开
    </a-button>
  </div>
</template>
