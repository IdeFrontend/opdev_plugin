<script setup lang="ts">
import { ref, h, nextTick } from 'vue';
import { RightOutlined, DownOutlined, FlagOutlined, FlagFilled } from '@ant-design/icons-vue';
import { formatTimestamp } from '../utils/timestamp';
import { handleOpenCsv, handleLoadData } from '../utils/fileHandlers';

const props = defineProps({
  treeData: Array,
});

const emit = defineEmits(['rightClick']);

// 自定义切换图标（三角箭头）
const switcherIcon = ({ expanded }) => {
  return h(expanded ? DownOutlined : RightOutlined, {
    style: { fontSize: '12px', color: '#fff' },
  });
};

// 树节点点击事件
const onSelect = (selectedKeys, info) => {
  const node = info.node;
  const data = node.dataRef || node;
  if (data.isLeaf) {
    if (data.fileType === 'csv') {
      handleOpenCsv(data.filePath);
    } else if (data.fileType === 'bin') {
      handleLoadData(data.filePath);
    }
  }
};

// 右键菜单事件
const handleRightClick = (info) => {
  // 阻止默认右键菜单
  info.event.preventDefault();
  info.event.stopPropagation();

  emit('rightClick', {
    node: info.node,
    event: info.event,
    x: info.event.clientX,
    y: info.event.clientY,
  });
};
</script>

<template>
  <div class="tree-container">
    <a-tree
      :tree-data="treeData"
      :show-line="false"
      :show-icon="false"
      :default-expand-all="true"
      :switcher-icon="switcherIcon"
      @select="onSelect"
      @rightClick="handleRightClick"
    >
      <template #title="{ dataRef }">
        <div class="tree-node">
          <div class="tree-node-title">{{ dataRef.title }}</div>
          <div v-if="dataRef.timestamp" class="tree-node-timestamp">
            {{ formatTimestamp(dataRef.timestamp) }}
          </div>
          <!-- <FlagOutlined />
          <FlagFilled /> -->
        </div>
      </template>
    </a-tree>
  </div>
</template>

<style lang="less" scoped>
.tree-container {
  width: 100%;
  position: relative;

  :deep(.ant-tree) {
    color: #fff;
    background: transparent;

    .tree-node {
      color: #fff;
      width: 100%;
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;

      .tree-node-title {
        color: #fff;
      }

      .tree-node-timestamp {
        color: rgba(255, 255, 255, 0.65);
        font-size: 12px;
        margin-top: 2px;
      }
    }
  }
}
</style>
