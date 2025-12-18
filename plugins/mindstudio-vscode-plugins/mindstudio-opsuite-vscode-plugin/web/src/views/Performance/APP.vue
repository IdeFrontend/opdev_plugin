<script setup>
import { theme } from 'ant-design-vue'
import { ref, nextTick } from 'vue'
import PerformanceTabs from './components/PerformanceTabs.vue'
import PerformanceTree from './components/PerformanceTree.vue'
import ContextMenu from './components/ContextMenu.vue'

const themeConfig = {
    algorithm: theme.darkAlgorithm
}

// 右键菜单相关
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const selectedNodeData = ref(null)

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

// 处理树节点右键点击
const handleTreeRightClick = (info) => {
    // 先关闭之前的菜单
    contextMenuVisible.value = false
    
    const node = info.node
    const data = node.dataRef || node
    selectedNodeData.value = data
    
    // 设置初始菜单位置
    contextMenuPosition.value = {
        x: info.x,
        y: info.y
    }
    
    // 使用 nextTick 确保之前的菜单已关闭，然后显示新菜单
    nextTick(() => {
        contextMenuVisible.value = true
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

// 关闭右键菜单
const closeContextMenu = () => {
    contextMenuVisible.value = false
}
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div 
            style="padding: 12px;"
            @contextmenu.prevent="handleContainerRightClick"
        >
            <PerformanceTabs />
            
            <div 
                @click="closeContextMenu"
                @contextmenu="handleContainerRightClick"
            >
                <PerformanceTree 
                    :tree-data="treeData"
                    @right-click="handleTreeRightClick"
                />
                
                <ContextMenu
                    :visible="contextMenuVisible"
                    :position="contextMenuPosition"
                    :node-data="selectedNodeData"
                    @close="closeContextMenu"
                />
            </div>
        </div>
    </a-config-provider>
</template>
