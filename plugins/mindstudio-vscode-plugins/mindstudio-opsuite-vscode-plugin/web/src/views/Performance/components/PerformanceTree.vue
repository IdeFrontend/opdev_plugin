<script setup>
import { ref, h, nextTick } from 'vue'
import { RightOutlined, DownOutlined } from '@ant-design/icons-vue'
import { formatTimestamp } from '../utils/timestamp'
import { handleOpenCsv, handleLoadData } from '../utils/fileHandlers'

const props = defineProps({
    treeData: Array
})

const emit = defineEmits(['rightClick'])

// 自定义切换图标（三角箭头）
const switcherIcon = ({ expanded }) => {
    return h(expanded ? DownOutlined : RightOutlined, {
        style: { fontSize: '12px', color: '#fff' }
    })
}

// 树节点点击事件
const onSelect = (selectedKeys, info) => {
    const node = info.node
    const data = node.dataRef || node
    if (data.isLeaf) {
        if (data.fileType === 'csv') {
            handleOpenCsv(data.filePath)
        } else if (data.fileType === 'bin') {
            handleLoadData(data.filePath)
        }
    }
}

// 右键菜单事件
const handleRightClick = (info) => {
    // 阻止默认右键菜单
    info.event.preventDefault()
    info.event.stopPropagation()

    emit('rightClick', {
        node: info.node,
        event: info.event,
        x: info.event.clientX,
        y: info.event.clientY
    })
}
</script>

<template>
    <div class="tree-container">
        <a-tree :tree-data="treeData" :show-line="false" :show-icon="false" :default-expand-all="true"
            :switcher-icon="switcherIcon" @select="onSelect" @rightClick="handleRightClick" class="performance-tree">
            <template #title="{ dataRef }">
                <div class="tree-node-title">
                    <div class="tree-node-name">{{ dataRef.title }}</div>
                    <div v-if="dataRef.timestamp" class="tree-node-timestamp">
                        {{ formatTimestamp(dataRef.timestamp) }}
                    </div>
                </div>
            </template>
        </a-tree>
    </div>
</template>

<style scoped>
.tree-container {
    width: 100%;
    position: relative;
}

.performance-tree {
    color: #fff;
    background: transparent;
}

:deep(.performance-tree .ant-tree-node-content-wrapper) {
    color: #fff;
    width: 100%;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
}

:deep(.ant-tree) {
    background-color: #181818
}

:deep(.performance-tree .ant-tree-node-content-wrapper:hover) {
    background-color: rgba(255, 255, 255, 0.1);
}

:deep(.performance-tree .ant-tree-node-selected .ant-tree-node-content-wrapper) {
    background-color: rgba(24, 144, 255, 0.3);
}

:deep(.performance-tree .ant-tree-treenode) {
    width: 100%;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-node-content) {
    flex: 1;
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-switcher) {
    color: #fff;
    width: 16px;
    height: 16px;
    line-height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
}

:deep(.performance-tree .ant-tree-iconEle) {
    display: none;
}

:deep(.performance-tree .ant-tree-switcher-icon) {
    color: #fff;
    font-size: 12px;
}

:deep(.performance-tree .ant-tree-switcher-icon svg) {
    width: 12px;
    height: 12px;
}

.tree-node-title {
    color: #fff;
    width: 100%;
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.tree-node-name {
    color: #fff;
}

.tree-node-timestamp {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    margin-top: 2px;
}

:deep(.performance-tree) {
    width: 100%;
}

:deep(.performance-tree .ant-tree-node-content-wrapper) {
    width: 100% !important;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-node) {
    width: 100%;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-node-content) {
    flex: 1;
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-treenode) {
    width: 100% !important;
    display: flex;
    align-items: center;
}

:deep(.performance-tree .ant-tree-list) {
    width: 100%;
}

:deep(.performance-tree .ant-tree-list-holder) {
    width: 100%;
}

:deep(.performance-tree .ant-tree-list-holder-inner) {
    width: 100%;
}

:deep(.performance-tree .ant-tree-treenode) {
    width: 100%;
    display: flex;
}
</style>
