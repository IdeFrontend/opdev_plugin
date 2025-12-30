<!-- 选择文件夹组件 -->

<script setup>
import { FolderOutlined } from "@ant-design/icons-vue";
import { ref, onMounted } from "vue";
import { message } from "../../../untils/Message.ts";

const props = defineProps({
    modelValue: {
        type: String,
        default: '',
    },
    placeholder: {
        type: String,
        default: '',
    }
})

const emits = defineEmits('update:modelValue')


const getSelectedFolder = {
    command: 'selectedDirectory',
    callback: (message) => {
        console.log('selectedDirectory', message.data)
        emits('update:modelValue', message.data)
    }
}

onMounted(() => {
    message.addMessageListener(getSelectedFolder)
})

const onClick = () => {
    message.sendMessageToParent({ command: 'vscodeSelectFolder' });
}
</script>

<template>
    <a-input :value="modelValue" :placeholder="placeholder" readonly>
        <template #suffix>
            <FolderOutlined style="cursor: pointer;" @click="onClick" />
        </template>
    </a-input>
</template>