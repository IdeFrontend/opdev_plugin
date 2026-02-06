<script setup lang="ts">
import {
  RightOutlined,
  DownOutlined,
  FlagOutlined,
  FlagFilled,
  CopyOutlined,
  DownloadOutlined,
  SwapOutlined,
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
  openCsvView,
  openInsightView,
  saveFileToLocal, 
  diffFiles
} from '@web/apis';

import { formatTimestamp } from '@web/views/sidebars/performance-run-data/utils/timestamp';

const props = defineProps<{
  treeData: PerformanceExecutionRecord[];
}>();

const emit = defineEmits<{
  (e: 'toggle-mark', key: string, marked: boolean): void;
}>();

const expandedKeys = ref<string[]>([]);
const selectedFiles = ref<PerformanceRunDataFile[]>([]);
const maxSelectedCount = 2; // 最大选择数量

const checkedKeys = ref<string[]>([]);

// 处理树数据，为目录节点添加 disableCheckbox 属性
const processedTreeData = computed(() => {
  const processNode = (node: any): any => {
    // 检查是否为目录（即非文件节点）
    const isDirectory = !isComparableFile(node);

    // 为目录节点添加 disableCheckbox 属性
    const processedNode = {
      ...node,
      disableCheckbox: isDirectory, // 目录节点禁用复选框
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

function isCsvFile(row: object): row is PerformanceRunDataFile {
  return (
    Reflect.has(row, 'filePath')
    && Reflect.get(row as PerformanceRunDataFile, 'fileType') === 'csv'
  );
}

function isInsightFile(row: object): row is PerformanceRunDataFile {
  return (
    Reflect.has(row, 'filePath')
    && [
      'bin',
      'json',
    ].includes(Reflect.get(row as PerformanceRunDataFile, 'fileType'))
  );
}

// 检查是否为可比较的文件类型
function isComparableFile(row: object): row is PerformanceRunDataFile {
  return isCsvFile(row) || isInsightFile(row);
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
  message.success(`正在比较 ${selectedFiles.value[0].filePath.split('/').pop()} 和 ${selectedFiles.value[1].filePath.split('/').pop()}`);

  // 显示文件对比模态框
  showFileComparisonModal.value = true;

  try {
    diffFiles({
      filePath1: selectedFiles.value[0].filePath,
      filePath2: selectedFiles.value[1].filePath
    })
    message.success('正在启动VSCode文件对比...');
  } catch (error) {
    console.error('调用VSCode文件对比功能失败:', error);
    message.error('启动VSCode文件对比失败');
  }
}

// 控制文件对比模态框的显示
const showFileComparisonModal = ref(false);


/**
 * 点击节点
 */
const onClickNode: DirectoryTreeProps['onSelect'] = function (_, info) {
  const node = info.node;
  const data = node.dataRef || node;

  // 对于文件，如果是可比较的文件类型，则打开对比选择，否则直接打开文件
  if (isComparableFile(data)) {
    // 如果是可比较的文件，不直接打开，而是让用户通过复选框选择进行对比
    // 或者双击打开文件
    console.log('可比较文件被点击:', data);
  } else if (isCsvFile(data)) {
    openCsvView(data.filePath);
  }
  else if (isInsightFile(data)) {
    openInsightView(data.filePath);
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

  if (selectedFiles.value.length > 0) {
    message.info(`已选择 ${selectedFiles.value.length} 个文件`);
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
</script>

<template>
  <div
    class="w-full relative [&_.ant-tree]:!text-white [&_.ant-tree]:!bg-transparent [&_.ant-tree-treenode]:!w-full [&_.ant-tree-node-content-wrapper]:!w-0 hover:[&_.ant-tree-treenode]:!bg-transparent"
  >
    <div class="flex justify-between items-center mb-2 px-2">
      <div class="text-sm text-gray-400">
        已选择 {{ selectedFiles.length }}/{{ maxSelectedCount }} 个文件
        <span v-if="selectedFiles.length > 0">
          ({{ selectedFiles.map(f => f.filePath.split('/').pop()).join(', ') }})
        </span>
      </div>
      <a-button
        v-if="selectedFiles.length > 0"
        size="small"
        :disabled="selectedFiles.length < 2"
        @click="performFileComparison"
      >
        <template #icon>
          <SwapOutlined />
        </template>
        比较文件
      </a-button>
    </div>

    <a-directory-tree
      :tree-data="processedTreeData"
      :show-line="false"
      :show-icon="false"
      :switcher-icon="SwitcherIcon"
      :expanded-keys="expandedKeys"
      :checkable="true"
      :checked-keys="checkedKeys"
      @update:expanded-keys="expandedKeys = $event as string[]"
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
          <template v-if="isRootDir(dataRef)">
            <div
              class="text-white/65 text-xs mt-1 leading-4 absolute bottom-[-16px] left-0 hidden"
            >
              {{ formatTimestamp(dataRef.timestamp) }}
            </div>
          </template>
        </div>
      </template>
    </a-directory-tree>
  </div>
</template>
