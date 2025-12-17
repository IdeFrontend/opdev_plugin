<script setup>
import { theme } from 'ant-design-vue'
import { ref, h, nextTick } from 'vue'
import { RightOutlined, DownOutlined } from '@ant-design/icons-vue'
import { message } from "../../untils/Message";

// 右键菜单相关
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const selectedNodeData = ref(null)

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

// 右键菜单事件
const handleRightClick = (info) => {
    // 先关闭之前的菜单
    contextMenuVisible.value = false
    
    const node = info.node
    const data = node.dataRef || node
    selectedNodeData.value = data
    
    // 阻止默认右键菜单
    info.event.preventDefault()
    info.event.stopPropagation()
    
    // 设置初始菜单位置
    const initialX = info.event.clientX
    const initialY = info.event.clientY
    
    // 使用 nextTick 确保之前的菜单已关闭，然后显示新菜单
    nextTick(() => {
        contextMenuVisible.value = true
        // 再次使用 nextTick 确保菜单已渲染，然后计算并调整位置
        nextTick(() => {
            adjustMenuPosition(initialX, initialY)
        })
    })
}

// 处理容器上的右键事件，阻止系统默认菜单
const handleContainerRightClick = (event) => {
    // 阻止系统默认右键菜单
    event.preventDefault()
    event.stopPropagation()
    
    // 如果点击的不是树节点，关闭菜单
    const target = event.target
    const isTreeNode = target.closest('.ant-tree-node-content-wrapper') || 
                       target.closest('.ant-tree-node') ||
                       target.closest('.ant-tree-treenode')
    
    if (!isTreeNode) {
        contextMenuVisible.value = false
    }
}

// 调整菜单位置，避免超出页面边界
const adjustMenuPosition = (x, y) => {
    const padding = 10 // 边距
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    // 尝试获取菜单的实际尺寸
    const menuElement = document.querySelector('.context-menu')
    let menuWidth = 150 // 默认最小宽度
    let menuHeight = 80 // 默认预估高度
    
    if (menuElement) {
        const rect = menuElement.getBoundingClientRect()
        menuWidth = rect.width || 150
        menuHeight = rect.height || 80
    }
    
    // 计算调整后的位置
    let adjustedX = x
    let adjustedY = y
    
    // 检查右边界
    if (x + menuWidth + padding > viewportWidth) {
        adjustedX = viewportWidth - menuWidth - padding
        // 如果调整后还是超出，则从鼠标位置向左展开
        if (adjustedX < 0) {
            adjustedX = Math.max(0, x - menuWidth - padding)
        }
    }
    
    // 检查下边界
    if (y + menuHeight + padding > viewportHeight) {
        adjustedY = viewportHeight - menuHeight - padding
        // 如果调整后还是超出，则从鼠标位置向上展开
        if (adjustedY < 0) {
            adjustedY = Math.max(0, y - menuHeight - padding)
        }
    }
    
    // 确保位置不为负数
    adjustedX = Math.max(padding, adjustedX)
    adjustedY = Math.max(padding, adjustedY)
    
    // 更新菜单位置
    contextMenuPosition.value = {
        x: adjustedX,
        y: adjustedY
    }
}

// 关闭右键菜单
const closeContextMenu = (event) => {
    // 如果点击的是菜单本身，不关闭
    if (event && (event.target.closest('.context-menu') || event.target.closest('.ant-menu'))) {
        return
    }
    contextMenuVisible.value = false
}

// 下载数据到本地
const handleDownload = () => {
    if (selectedNodeData.value) {
        const nodeData = selectedNodeData.value
        // 根据节点类型确定文件路径
        let filePath = ''
        if (nodeData.filePath) {
            filePath = nodeData.filePath
        } else if (nodeData.key) {
            // 如果是文件夹节点，可能需要特殊处理
            filePath = nodeData.key
        }
        
        console.log('下载数据到本地:', filePath)
        message.sendMessageToParent({
            command: "vscodeDownloadData",
            data: {
                filePath: filePath,
                nodeKey: nodeData.key
            }
        })
        closeContextMenu()
    }
}

// 删除节点
const handleDelete = () => {
    if (selectedNodeData.value) {
        const nodeData = selectedNodeData.value
        console.log('删除节点:', nodeData.key)
        message.sendMessageToParent({
            command: "vscodeDeleteNode",
            data: {
                nodeKey: nodeData.key,
                filePath: nodeData.filePath
            }
        })
        closeContextMenu()
    }
}
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div 
            style="padding: 12px;"
            @contextmenu.prevent="handleContainerRightClick"
        >
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
            
            <div 
                class="tree-container" 
                @click="closeContextMenu"
                @contextmenu="handleContainerRightClick"
            >
                <a-tree
                    :tree-data="treeData"
                    :show-line="false"
                    :show-icon="false"
                    :default-expand-all="true"
                    :switcher-icon="switcherIcon"
                    @select="onSelect"
                    @rightClick="handleRightClick"
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
                
                <!-- 右键菜单 -->
                <div
                    v-if="contextMenuVisible"
                    class="context-menu-overlay"
                    @click="closeContextMenu"
                    @contextmenu.prevent="handleContainerRightClick"
                >
                    <a-menu 
                        class="context-menu"
                        :style="{
                            position: 'fixed',
                            left: contextMenuPosition.x + 'px',
                            top: contextMenuPosition.y + 'px',
                            zIndex: 10000
                        }"
                        @click="(e) => {
                            // 点击菜单项后关闭菜单
                            closeContextMenu(e)
                        }"
                    >
                        <a-menu-item key="download" @click="handleDownload">
                            下载数据到本地
                        </a-menu-item>
                        <a-menu-item key="delete" @click="handleDelete" danger>
                            删除
                        </a-menu-item>
                    </a-menu>
                </div>
            </div>
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
    width: 100%;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
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
}

.tree-node-name {
    color: #fff;
}

.tree-node-timestamp {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    margin-top: 2px;
}

.tree-container {
    width: 100%;
    position: relative;
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

.tree-node-title {
    color: #fff;
    width: 100%;
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.context-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
}

.context-menu {
    background: #1f1f1f;
    border: 1px solid #434343;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    min-width: 150px;
}

:deep(.context-menu .ant-dropdown-menu-item) {
    color: #fff;
}

:deep(.context-menu .ant-dropdown-menu-item:hover) {
    background-color: rgba(255, 255, 255, 0.1);
}

:deep(.context-menu .ant-dropdown-menu-item-danger) {
    color: #ff4d4f;
}

:deep(.context-menu .ant-dropdown-menu-item-danger:hover) {
    background-color: rgba(255, 77, 79, 0.1);
}
</style>

