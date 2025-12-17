<script setup>
import { theme } from 'ant-design-vue'
import { ref } from 'vue'
import { message } from "../../untils/Message";

const themeConfig = {
    algorithm: theme.darkAlgorithm
}

const activeTab = ref('executionTime')

const handleExecutionTime = () => {
    activeTab.value = 'executionTime'
    console.log('切换到执行时间')
    // 可以在这里添加发送消息到 VSCode 的逻辑
    message.sendMessageToParent({ command: "vscodePerformanceExecutionTime" });
}

const handleMarked = () => {
    activeTab.value = 'marked'
    console.log('切换到已标记')
    // 可以在这里添加发送消息到 VSCode 的逻辑
    message.sendMessageToParent({ command: "vscodePerformanceMarked" });
}
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div style="padding: 12px;">
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
            <div v-if="activeTab === 'executionTime'" style="color: #fff;">
                <!-- 执行时间内容区域 -->
                <p>执行时间内容</p>
            </div>
            <div v-if="activeTab === 'marked'" style="color: #fff;">
                <!-- 已标记内容区域 -->
                <p>已标记内容</p>
            </div>
        </div>
    </a-config-provider>
</template>

<style scoped>
</style>

