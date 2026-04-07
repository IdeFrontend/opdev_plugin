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
import { t } from 'i18next';
import { message, Dropdown } from 'ant-design-vue';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
} from '@shared/api-types';

import {
  openFile,
  diffFiles,
  importDumpTensorBinFile
} from '@web/apis';
import { selectFile } from '@web/apis/performance-run-data';

const props = defineProps<{
  treeData: PerformanceExecutionRecord[];
}>();

const expandedKeys = ref<string[]>([]);
const selectedFiles = ref<PerformanceRunDataFile[]>([]);
const maxSelectedCount = 2; // Max files selectable for compare.

const checkedKeys = ref<string[]>([]);

// Normalize tree nodes for compare behavior.
const processedTreeData = computed(() => {
  const processNode = (node: any): any => {
    // Directory nodes are non-file nodes.
    const isDirectory = !isComparableFile(node);

    const processedNode = {
      ...node,
      checkable: !isDirectory, // Disable checkbox for directories.
    };

    // Recurse children.
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

// Custom switcher icon (triangle).
const SwitcherIcon: Component = ({ expanded }) => {
  return h(expanded ? DownOutlined : RightOutlined, {
    style: {
      fontSize: '12px',
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

// Comparable file types.
function isComparableFile(row: object): row is PerformanceRunDataFile {
  return isTxtFile(row) || isBinFile(row);
}

/**
 * Run file comparison.
 */
function performFileComparison() {
  if (selectedFiles.value.length < 2) {
    message.warning(t('web.dump.selectTwoFiles'));
    return;
  }

  console.log('[DumpTensor] Compare files:', selectedFiles.value);

  try {
    diffFiles({
      filePath1: (selectedFiles.value[0].filePath || '').replace(/\.bin$/, '.txt'),
      filePath2: (selectedFiles.value[1].filePath || '').replace(/\.bin$/, '.txt')
    }).finally(() => {
      // Reset compare mode after compare completes.
      cancelCompare();
    })
    message.success(t('web.dump.compareStarting'));
  } catch (error) {
    console.error('[DumpTensor] VSCode file compare failed:', error);
    message.error(t('web.dump.compareFailed'));
    cancelCompare();
  }
}

/**
 * Handle tree node click.
 */
const onClickNode: DirectoryTreeProps['onSelect'] = function (_, info) {
  const node = info.node;
  const data = node.dataRef || node;
  
  console.log('[DumpTensor] Open file:', data)

  if (isTxtFile(data) || isBinFile(data)) {
    openFile({ file: (data.filePath || '').replace(/\.bin$/, '.txt') });
  }
};

/**
 * Handle checkbox selection.
 */
function onCheck(checkedKeysValue: any, e: { checked: boolean; node: any }) {
  // Gather checked keys.
  const allCheckedKeys = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;

  // Walk the tree to identify file nodes.
  const allFileKeys = getAllFileKeys(props.treeData);

  // Keep file keys only.
  const fileKeys = allCheckedKeys.filter((key: string) => allFileKeys.includes(key));

  // Limit to max selectable files.
  if (fileKeys.length > maxSelectedCount) {
    // Keep only most-recent selections.
    const limitedFileKeys = fileKeys.slice(-maxSelectedCount);
    checkedKeys.value = limitedFileKeys;

    // Update selected file models.
    selectedFiles.value = getFileObjectsFromKeys(limitedFileKeys, props.treeData);

    message.warning(t('web.dump.maxSelectCount', { count: maxSelectedCount }));
  } else {
    checkedKeys.value = fileKeys;

    // Update selected file models.
    selectedFiles.value = getFileObjectsFromKeys(fileKeys, props.treeData);
  }
}

/**
 * Recursively collect all file keys from tree.
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
 * Resolve file objects by keys.
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

// Whether compare mode is enabled.
const isComparing = ref(false)

const cancelCompare = () => {
  isComparing.value = false

  selectedFiles.value = [];
  checkedKeys.value = []
}

const openCompare = () => {
  isComparing.value = true
}

// Handle import action.
const handleImport = async () => {
  try {
    // Open file picker for .bin files.
    const selectedFilePath = await selectFile({
      fileTypes: [
        {
          label: 'Binary Files',
          extensions: ['bin']
        }
      ]
    });

    if (selectedFilePath) {
      // Import selected .bin file.
      await importDumpTensorBinFile({ binFilePath: selectedFilePath });
      message.success(t('web.dump.importSuccess'));
      // Ask parent to refresh data.
      window.dispatchEvent(new CustomEvent('refreshTreeData'));
    }
  } catch (error) {
    console.error('[DumpTensor] Import action failed:', error);
    message.error(t('web.dump.importFailed'));
  }
}
</script>

<template>
  <div
    class="w-full relative [&_.ant-tree]:!bg-transparent [&_.ant-tree-treenode]:!w-full [&_.ant-tree-node-content-wrapper]:!w-0 hover:[&_.ant-tree-treenode]:!bg-transparent"
  >
    <template v-if="processedTreeData && processedTreeData.length">
      <div v-show="isComparing" class="filter-bar">
        <a-button type="primary" @click="performFileComparison">{{ t('web.dump.startCompare') }}</a-button>
        <a-button class="default-btn" @click="cancelCompare">{{ t('web.dump.cancel') }}</a-button>
      </div>
      <div v-show="!isComparing" class="filter-bar">
        <a-button class="default-btn" @click="handleImport">{{ t('web.dump.import') }}</a-button>
        <a-button class="default-btn" @click="openCompare">{{ t('web.dump.compare') }}</a-button>
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
          class="w-full relative group flex items-center"
          style="padding-right: 100px;"
          :class="{
            'pr-8': isRootDir(dataRef)
          }"
        >
          <div
            class="w-full overflow-hidden text-ellipsis whitespace-nowrap"
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
</style>