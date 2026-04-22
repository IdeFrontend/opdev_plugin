<script setup lang="ts">
import { t } from 'i18next';
import {
  FileOutlined, FolderOutlined, QuestionCircleOutlined,
} from '@ant-design/icons-vue';
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
  handleSelectFolder,
  handleSelectFile,
  handleOpenProject,
} = useOpenProject();

const connectionFormRules = OpenProjectFormRulesFactory.createFormRules();
</script>
<template>
  <div
    class="text-left text-sm font-normal leading-[22px] [&_.ant-form-item-label_.help-icon]:text-white/45 [&_.ant-form-item-label_.help-icon]:cursor-help [&_.ant-form-item-label_.help-icon]:text-sm [&_.ant-form-item-label_.help-icon]:ml-1"
  >
    <a-form
      ref="connectionFormRef"
      :model="projectFormData"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      :rules="connectionFormRules as any"
      layout="vertical"
    >
      <a-form-item name="projectPath">
        <template #label>
          <span>{{ t('web.openProject.projectPathLabel') }}</span>
          <a-tooltip :title="t('web.openProject.projectPathTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>
        <div class="flex gap-2 items-center">
          <a-auto-complete
            v-model:value="projectFormData.projectPath"
            :options="projectPathOptions"
            :loading="projectPathLoading"
            :placeholder="t('web.openProject.projectPathPlaceholder')"
            class="flex-1 min-w-0"
            @search="(val) => remoteSearch('projectPath', val)"
          />
          <a-button
            type="default"
            size="middle"
            :title="t('common.selectFolder')"
            @click="handleSelectFolder"
          >
            <template #icon>
              <FolderOutlined />
            </template>
          </a-button>
        </div>
      </a-form-item>
      <a-form-item name="projectSH">
        <template #label>
          <span>{{ t('web.openProject.envScriptLabel') }}</span>
          <a-tooltip :title="t('web.openProject.envScriptTooltip')">
            <QuestionCircleOutlined class="help-icon" />
          </a-tooltip>
        </template>
        <div class="flex gap-2 items-center">
          <a-auto-complete
            v-model:value="projectFormData.projectSH"
            :options="projectSHOptions"
            :loading="projectSHLoading"
            :placeholder="t('web.openProject.envScriptPlaceholder')"
            class="flex-1 min-w-0"
            @search="(val) => remoteSearch('projectSH', val)"
          />
          <a-button
            type="default"
            size="middle"
            :title="t('common.selectFile')"
            @click="handleSelectFile"
          >
            <template #icon>
              <FileOutlined />
            </template>
          </a-button>
        </div>
      </a-form-item>
    </a-form>
    <a-button
      type="primary"
      class="!mt-6 !w-auto !min-w-[84px] !px-4 !h-8 !rounded-none"
      style="float: right;"
      @click="handleOpenProject"
    >
      {{ t('web.openProject.openNow') }}
    </a-button>
  </div>
</template>
