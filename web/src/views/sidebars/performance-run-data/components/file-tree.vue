<script setup lang="ts">
import {
  RightOutlined,
  DownOutlined,
  FlagOutlined,
  FlagFilled,
} from '@ant-design/icons-vue';
import type { DirectoryTreeProps } from 'ant-design-vue';
import {
  Component, h, ref, watch,
} from 'vue';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
} from '@shared/api-types';

import {
  openCsvView, openInsightView,
} from '@web/apis';

import { formatTimestamp } from '@web/views/sidebars/performance-run-data/utils/timestamp';

const props = defineProps<{
  treeData: PerformanceExecutionRecord[];
}>();

const emit = defineEmits<{
  (e: 'toggle-mark', key: string, marked: boolean): void;
}>();

const expandedKeys = ref<string[]>([]);

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

// 标记
const MarkedIcon: Component = ({ marked }) =>
  h(marked ? FlagFilled : FlagOutlined, { style: { color: marked ? '#d32029' : undefined } });

function handleToggleMarked(
  record: PerformanceExecutionRecord,
  marked: boolean,
) {
  emit('toggle-mark', record.key, marked);
}

/**
 * 点击节点
 */
const onClickNode: DirectoryTreeProps['onSelect'] = function (_, info) {
  const node = info.node;
  const data = node.dataRef || node;

  if (isCsvFile(data)) {
    openCsvView(data.filePath);
  }
  else if (isInsightFile(data)) {
    openInsightView(data.filePath);
  }
};
</script>

<template>
  <div
    class="w-full relative [&_.ant-tree]:!text-white [&_.ant-tree]:!bg-transparent [&_.ant-tree-treenode]:!w-full [&_.ant-tree-node-content-wrapper]:!w-0 hover:[&_.ant-tree-treenode]:!bg-transparent"
  >
    <a-directory-tree
      :tree-data="treeData as any"
      :show-line="false"
      :show-icon="false"
      :switcher-icon="SwitcherIcon"
      :expanded-keys="expandedKeys"
      @update:expanded-keys="expandedKeys = $event as string[]"
      @select="onClickNode"
    >
      <template #title="{ dataRef }">
        <div
          class="text-white w-full relative group flex items-center"
          :class="{ 'pr-8': isRootDir(dataRef) }"
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
            <div
              class="pointer-events-none absolute top-0 right-0 h-full flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto"
            >
              <!-- 下载 -->
              <!-- <a-button type="text" :icon="h(DownloadOutlined)" @click.stop="handleClickDownload(dataRef)"></a-button> -->
              <!-- 标记/取消标记 -->
              <a-button
                :class="{ 'opacity-100': dataRef.marked }"
                type="text"
                :icon="h(MarkedIcon, { marked: dataRef.marked })"
                @click.stop="handleToggleMarked(dataRef, !dataRef.marked)"
              />
            </div>
          </template>
        </div>
      </template>
    </a-directory-tree>
  </div>
</template>
