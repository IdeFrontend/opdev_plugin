<template>
  <a-modal
    v-model:visible="modalVisible"
    title="文件对比"
    width="600px"
    @ok="performVscodeDiff"
    @cancel="handleCancel"
  >
    <div v-if="selectedFiles.length < 2" class="text-center py-8">
      <p>请选择两个文件进行比较</p>
    </div>
    <div v-else>
      <p class="mb-4">将要比较以下两个文件：</p>
      <div class="mb-2">
        <strong>文件1:</strong> {{ selectedFiles[0].filePath.split('/').pop() }}
      </div>
      <div class="mb-4">
        <strong>文件2:</strong> {{ selectedFiles[1].filePath.split('/').pop() }}
      </div>
      <p>此操作将在VSCode中打开原生的文件对比视图。</p>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, message } from 'ant-design-vue';
import type { PerformanceRunDataFile } from '@shared/api-types';
import {
  diffFiles
} from '@web/apis';


const props = defineProps<{
  selectedFiles: PerformanceRunDataFile[];
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', visible: boolean): void;
  (e: 'close'): void;
}>();

const modalVisible = ref(false);

watch(
  () => props.visible,
  (newVal) => {
    modalVisible.value = newVal;
  }
);

// 调用VSCode原生文件对比功能
const performVscodeDiff = async () => {
  if (props.selectedFiles.length !== 2) {
    message.warning('请选择两个文件进行比较');
    return;
  }

  try {
    diffFiles({
      filePath1: props.selectedFiles[0].filePath,
      filePath2: props.selectedFiles[1].filePath
    })

    message.success('正在启动VSCode文件对比...');

    // 关闭模态框
    emit('update:visible', false);
    emit('close');
  } catch (error) {
    console.error('调用VSCode文件对比功能失败:', error);
    message.error('启动VSCode文件对比失败');
  }
};

const handleCancel = () => {
  emit('update:visible', false);
  emit('close');
};
</script>