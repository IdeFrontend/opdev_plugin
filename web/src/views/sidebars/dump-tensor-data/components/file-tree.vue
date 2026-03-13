<script setup lang="ts">
import {
  RightOutlined,
  DownOutlined,
  FlagOutlined,
  FlagFilled,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue';
import type { DirectoryTreeProps } from 'ant-design-vue';
import {
  Component, h, ref, watch, computed,
} from 'vue';
import { message, Dropdown } from 'ant-design-vue';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
} from '@shared/api-types';

import {
  openFile,
  diffFiles
} from '@web/apis';

const props = defineProps<{
  treeData: PerformanceExecutionRecord[];
}>();

const expandedKeys = ref<string[]>([]);
const selectedFiles = ref<PerformanceRunDataFile[]>([]);
const maxSelectedCount = 2; // 最大选择数量

const checkedKeys = ref<string[]>([]);

// 处理树数据
const processedTreeData = computed(() => {
  const processNode = (node: any): any => {
    // 检查是否为目录（即非文件节点）
    const isDirectory = !isComparableFile(node);

    const processedNode = {
      ...node,
      checkable: !isDirectory, // 目录节点禁用复选框
    };

    // 如果有子节点，递归处理
    if (node.children && Array.isArray(node.children)) {
      processedNode.children = node.children.map(processNode);
    }

    return processedNode;
  };

  return props.treeData.map(processNode);
});

watch(
  () => props.treeData,
  (newData) => {
    if (newData.length > 0 && newData[0].key) {
      expandedKeys.value = [newData[0].key];
    }
  },
  { immediate: true },
);

// 自定义切换图标（三角箭头）
const SwitcherIcon: Component = ({ expanded }) => {
  return h(expanded ? DownOutlined : RightOutlined, {
    style: {
      fontSize: '12px',
      color: '#fff',
    },
  });
};

function isRootDir(row: object): row is PerformanceExecutionRecord {
  return Reflect.has(row, 'timestamp') && Reflect.has(row, 'dirPath');
}

function isTxtFile(row: object): row is PerformanceRunDataFile {
  return (
    Reflect.has(row, 'filePath')
    && Reflect.get(row as PerformanceRunDataFile, 'fileType') === 'txt'
  );
}

function isBinFile(row: object): row is PerformanceRunDataFile {
  return (
    Reflect.has(row, 'filePath')
    && [
      'bin',
    ].includes(Reflect.get(row as PerformanceRunDataFile, 'fileType'))
  );
}

// 检查是否为可比较的文件类型
function isComparableFile(row: object): row is PerformanceRunDataFile {
  return isTxtFile(row) || isBinFile(row);
}

/**
 * 执行文件对比
 */
function performFileComparison() {
  if (selectedFiles.value.length < 2) {
    message.warning('请选择至少两个文件进行比较');
    return;
  }

  // 这里可以调用实际的文件对比功能
  console.log('执行文件对比:', selectedFiles.value);

  try {
    diffFiles({
      filePath1: (selectedFiles.value[0].filePath || '').replace(/\.bin$/, '.txt'),
      filePath2: (selectedFiles.value[1].filePath || '').replace(/\.bin$/, '.txt')
    }).finally(() => {
      // 对比完成后取消对比状态
      cancelCompare();
    })
    message.success('正在启动VSCode文件对比...');
  } catch (error) {
    console.error('调用VSCode文件对比功能失败:', error);
    message.error('启动VSCode文件对比失败');
    // 出错时也取消对比状态
    cancelCompare();
  }
}

/**
 * 点击节点
 */
const onClickNode: DirectoryTreeProps['onSelect'] = function (_, info) {
  const node = info.node;
  const data = node.dataRef || node;
  
  console.log('[onClickNode]: 打开文件', data)

  if (isTxtFile(data) || isBinFile(data)) {
    openFile({ file: (data.filePath || '').replace(/\.bin$/, '.txt') });
  }
};

/**
 * 处理复选框勾选
 */
function onCheck(checkedKeysValue: any, e: { checked: boolean; node: any }) {
  // 从 checkedKeysValue 中获取所有被勾选的 keys
  const allCheckedKeys = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;

  // 由于我们无法直接获取节点信息，我们需要遍历整个树来确定哪些是文件节点
  const allFileKeys = getAllFileKeys(props.treeData);

  // 过滤出只包含文件的 keys
  const fileKeys = allCheckedKeys.filter((key: string) => allFileKeys.includes(key));

  // 限制最多选择2个文件
  if (fileKeys.length > maxSelectedCount) {
    // 只保留最后选择的几个文件
    const limitedFileKeys = fileKeys.slice(-maxSelectedCount);
    checkedKeys.value = limitedFileKeys;

    // 更新 selectedFiles 数组
    selectedFiles.value = getFileObjectsFromKeys(limitedFileKeys, props.treeData);

    message.warning(`最多只能选择 ${maxSelectedCount} 个文件进行比较`);
  } else {
    checkedKeys.value = fileKeys;

    // 更新 selectedFiles 数组
    selectedFiles.value = getFileObjectsFromKeys(fileKeys, props.treeData);
  }
}

/**
 * 递归获取树中所有文件类型的节点 keys
 */
function getAllFileKeys(nodes: any[]): string[] {
  let keys: string[] = [];

  const traverse = (nodeList: any[]) => {
    nodeList.forEach(node => {
      if (isComparableFile(node)) {
        keys.push(node.key);
      }

      if (node.children && Array.isArray(node.children)) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);

  return keys;
}

/**
 * 根据 keys 获取对应的文件对象
 */
function getFileObjectsFromKeys(keys: string[], nodes: any[]): PerformanceRunDataFile[] {
  const files: PerformanceRunDataFile[] = [];

  const traverse = (nodeList: any[]) => {
    nodeList.forEach(node => {
      if (isComparableFile(node) && keys.includes(node.key)) {
        files.push(node as PerformanceRunDataFile);
      }

      if (node.children && Array.isArray(node.children)) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);

  return files;
}

const updateExpand = (e) => {
  expandedKeys.value = e
}

// 是否正在进行对比
const isComparing = ref(false)

const cancelCompare = () => {
  isComparing.value = false

  selectedFiles.value = [];
  checkedKeys.value = []
}

const openCompare = () => {
  isComparing.value = true
}
</script>

<template>
  <div
    class="w-full relative [&_.ant-tree]:!text-white [&_.ant-tree]:!bg-transparent [&_.ant-tree-treenode]:!w-full [&_.ant-tree-node-content-wrapper]:!w-0 hover:[&_.ant-tree-treenode]:!bg-transparent"
  >
    <template v-if="processedTreeData && processedTreeData.length">
      <div v-show="isComparing" class="filter-bar">
        <a-button type="primary" @click="performFileComparison">开始对比</a-button>
        <a-button class="default-btn" @click="cancelCompare">取消</a-button>
      </div>
      <div v-show="!isComparing" class="filter-bar">
        <a-button class="default-btn">导入</a-button>
        <a-button class="default-btn" @click="openCompare">对比</a-button>
      </div>
    </template>

    <a-directory-tree
      :tree-data="processedTreeData"
      :show-line="false"
      :show-icon="false"
      :switcher-icon="SwitcherIcon"
      :expanded-keys="expandedKeys"
      :checkable="isComparing"
      :checked-keys="checkedKeys"
      @update:expanded-keys="updateExpand"
      @select="onClickNode"
      @check="onCheck"
    >
      <template #title="{ dataRef }">
        <div
          class="text-white w-full relative group flex items-center"
          style="padding-right: 100px;"
          :class="{
            'pr-8': isRootDir(dataRef),
            '!bg-blue-500/20': selectedFiles.some(f => f.filePath === (dataRef as PerformanceRunDataFile).filePath)
          }"
        >
          <div
            class="text-white w-full overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {{ dataRef.title }}
          </div>
        </div>
      </template>
    </a-directory-tree>
  </div>
</template>

<style scpoed>
.filter-bar {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.default-btn {
  background-color: rgba(20, 20, 20, 0.96) !important;
  border-color: rgb(72, 72, 73) !important;
  color: rgba(255, 255, 255, 0.855) !important;
  box-shadow: rgba(255, 255, 255, 0.04) !important;
}
</style>