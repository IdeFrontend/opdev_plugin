<script setup>
import { ref, nextTick, watch } from 'vue'
import { handleDownload, handleDelete } from '../utils/fileHandlers'

const props = defineProps({
    visible: Boolean,
    position: Object,
    nodeData: Object
})

const emit = defineEmits(['close'])

const adjustedPosition = ref({ x: 0, y: 0 })

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
    
    adjustedPosition.value = {
        x: adjustedX,
        y: adjustedY
    }
}

// 监听位置变化，调整菜单位置
watch(() => props.visible, (newVal) => {
    if (newVal) {
        nextTick(() => {
            adjustMenuPosition(props.position.x, props.position.y)
        })
    }
}, { immediate: true })

watch(() => props.position, (newPos) => {
    if (props.visible) {
        nextTick(() => {
            adjustMenuPosition(newPos.x, newPos.y)
        })
    }
}, { deep: true })

// 关闭右键菜单
const closeContextMenu = (event) => {
    // 如果点击的是菜单本身，不关闭
    if (event && (event.target?.closest('.context-menu') || 
        event.target?.closest('.ant-menu'))) {
        return
    }
    emit('close')
}

// 处理下载
const onDownload = () => {
    if (props.nodeData) {
        handleDownload(props.nodeData)
        emit('close')
    }
}

// 处理删除
const onDelete = () => {
    if (props.nodeData) {
        handleDelete(props.nodeData)
        emit('close')
    }
}
</script>

<template>
    <div
        v-if="visible"
        class="context-menu-overlay"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
    >
        <a-menu 
            class="context-menu"
            :style="{
                position: 'fixed',
                left: adjustedPosition.x + 'px',
                top: adjustedPosition.y + 'px',
                zIndex: 10000
            }"
            @click="closeContextMenu"
        >
            <a-menu-item key="download" @click="onDownload">
                下载数据到本地
            </a-menu-item>
            <a-menu-item key="delete" @click="onDelete" danger>
                删除
            </a-menu-item>
        </a-menu>
    </div>
</template>

<style scoped>
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

