<script setup>
import { theme } from 'ant-design-vue'
import { ref, h } from 'vue'
import { RightOutlined, DownOutlined } from '@ant-design/icons-vue'
import { message } from "../../untils/Message";

const themeConfig = {
    algorithm: theme.darkAlgorithm
}

const activeTab = ref('executionTime')

const handleExecutionTime = () => {
    message.sendMessageToParent({ command: "vscodePerformanceExecutionTime" });
}

const handleMarked = () => {
    message.sendMessageToParent({ command: "vscodePerformanceMarked" });
}

const handleOpenCsv = (csvPath) => {
    console.log('打开 CSV 文件:', csvPath)
    message.sendMessageToParent({ 
        command: "vscodeOpenCsv", 
        data: csvPath 
    });
}

const handleLoadData = (binPath) => {
    console.log('加载 BIN 文件:', binPath)
    message.sendMessageToParent({ 
        command: "vscodeinsigLoadData", 
        data: binPath 
    });
}

// 格式化时间戳为指定格式 "25-10-24 上午 8:50"
const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const year = date.getFullYear().toString().slice(-2) // 年份后两位
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    // 判断上午/下午
    const period = hours < 12 ? '上午' : '下午'
    const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
    
    return `${year}-${month}-${day} ${period} ${displayHour}:${minutes}`
}

// 树形数据结构
// 假设时间戳：msProf-20251014 对应 2025-10-14 08:50，msProf-20251015 对应 2025-10-15 14:30
const treeData = ref([
    {
        title: 'msProf-20251014',
        key: 'msProf-20251014',
        timestamp: new Date('2025-10-14 08:50:00').getTime(),
        children: [
            {
                title: '算子性能数据文件',
                key: 'msProf-20251014-folder',
                children: [
                    {
                        title: 'example2.csv',
                        key: 'msProf-20251014-example2',
                        isLeaf: true,
                        filePath: 'D:\\msttObj\\alldemos\\打开csv\\example2.csv',
                        fileType: 'csv'
                    },
                    {
                        title: 'example3.csv',
                        key: 'msProf-20251014-example3',
                        isLeaf: true,
                        filePath: 'D:\\msttObj\\alldemos\\打开csv\\example3.csv',
                        fileType: 'csv'
                    },
                    {
                        title: 'data.BIN',
                        key: 'msProf-20251014-data',
                        isLeaf: true,
                        filePath: 'D:\\msttObj\\alldemos\\打开csv\\data.BIN',
                        fileType: 'bin'
                    }
                ]
            }
        ]
    },
    {
        title: 'msProf-20251015',
        key: 'msProf-20251015',
        timestamp: new Date('2025-10-15 14:30:00').getTime(),
        children: [
            {
                title: '算子性能数据文件',
                key: 'msProf-20251015-folder',
                children: [
                    {
                        title: 'example.csv',
                        key: 'msProf-20251015-example',
                        isLeaf: true,
                        filePath: 'D:\\msttObj\\alldemos\\打开csv\\example.csv',
                        fileType: 'csv'
                    },
                    {
                        title: 'data.BIN',
                        key: 'msProf-20251015-data',
                        isLeaf: true,
                        filePath: 'D:\\msttObj\\alldemos\\打开csv\\data.BIN',
                        fileType: 'bin'
                    }
                ]
            }
        ]
    }
])


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
            
            <a-tree
                :tree-data="treeData"
                :show-line="false"
                :show-icon="false"
                :default-expand-all="true"
                :switcher-icon="switcherIcon"
                @select="onSelect"
                class="performance-tree"
            >
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
    </a-config-provider>
</template>

<style scoped>
.performance-tree {
    color: #fff;
    background: transparent;
}

:deep(.performance-tree .ant-tree-node-content-wrapper) {
    color: #fff;
}

:deep(.performance-tree .ant-tree-node-content-wrapper:hover) {
    background-color: rgba(255, 255, 255, 0.1);
}

:deep(.performance-tree .ant-tree-node-selected .ant-tree-node-content-wrapper) {
    background-color: rgba(24, 144, 255, 0.3);
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
}

.tree-node-name {
    color: #fff;
}

.tree-node-timestamp {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    margin-top: 2px;
}
</style>

