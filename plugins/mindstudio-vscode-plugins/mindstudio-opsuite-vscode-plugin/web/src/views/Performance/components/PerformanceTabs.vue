<script setup>
import { ref } from 'vue'
import { message } from "../../../untils/Message";

const activeTab = ref('executionTime')

const handleExecutionTime = () => {
    activeTab.value = 'executionTime'
    message.sendMessageToParent({ command: "vscodePerformanceExecutionTime" });
}

const handleMarked = () => {
    activeTab.value = 'marked'
    message.sendMessageToParent({ command: "vscodePerformanceMarked" });
}
</script>

<template>
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <a-button 
            :type="activeTab === 'executionTime' ? 'primary' : 'default'"
            @click="handleExecutionTime"
            size="small"
        >
            执行时间
        </a-button>
        <a-button 
            :type="activeTab === 'marked' ? 'primary' : 'default'"
            @click="handleMarked"
            size="small"
        >
            已标记
        </a-button>
    </div>
</template>

