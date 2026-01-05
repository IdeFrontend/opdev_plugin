<!-- 选择文件夹组件 -->

<script setup>
import { FolderOutlined } from '@ant-design/icons-vue';
import { selectFolder } from '@/apis';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
});
console.log('props', props);

const emits = defineEmits(['update:modelValue']);

const onClick = async () => {
  try {
    const folderPath = await selectFolder();

    if (folderPath) {
      console.log('selectedDirectory', folderPath);
      emits('update:modelValue', folderPath);
      // 发送消息给 iframe
      window.postMessage(
        { command: 'selectedDirectory', data: folderPath },
        '*',
      );
    }
  } catch (error) {
    console.error('选择文件夹失败:', error);
  }
};
</script>

<template>
  <a-input
    :value="modelValue"
    :placeholder="placeholder"
    readonly
  >
    <template #suffix>
      <FolderOutlined
        style="cursor: pointer"
        @click="onClick"
      />
    </template>
  </a-input>
</template>
