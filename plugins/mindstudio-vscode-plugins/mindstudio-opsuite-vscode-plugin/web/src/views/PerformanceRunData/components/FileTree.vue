<script setup lang="ts">
import { RightOutlined, DownOutlined, FlagOutlined, FlagFilled, DownloadOutlined } from '@ant-design/icons-vue';
import type { DirectoryTreeProps } from 'ant-design-vue';
import { Component, h } from 'vue';

import { PerformanceExecutionRecord, PerformanceRunDataFile } from 'shared:/api-types';

import { openCsvView, openInsightView, saveFileToLocal } from '@/apis';

import { formatTimestamp } from '../utils/timestamp';

defineProps<{
  treeData: PerformanceExecutionRecord[];
}>();

const emit = defineEmits<{
  (e: 'toggle-mark', key: string, marked: boolean): void;
}>();

// 自定义切换图标（三角箭头）
const SwitcherIcon: Component = ({ expanded }) => {
  return h(expanded ? DownOutlined : RightOutlined, {
    style: { fontSize: '12px', color: '#fff' },
  });
};

function isRunData(row: object): row is PerformanceExecutionRecord {
  return Reflect.has(row, 'timestamp');
}

function isCsvFile(row: object): row is PerformanceRunDataFile {
  return Reflect.has(row, 'filePath') && Reflect.get(row as PerformanceRunDataFile, 'fileType') === 'csv';
}

function isBinFile(row: object): row is PerformanceRunDataFile {
  return Reflect.has(row, 'filePath') && Reflect.get(row as PerformanceRunDataFile, 'fileType') === 'bin';
}

function handleClickDownload(record: PerformanceExecutionRecord) {
  saveFileToLocal({ filename: `${record.title}.zip` });
}

// 标记
const MarkedIcon: Component = ({ marked }) => h(marked ? FlagFilled : FlagOutlined, { style: { color: marked ? '#d32029' : undefined } });
function handleToggleMarked(record: PerformanceExecutionRecord, marked: boolean) {
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
  } else if (isBinFile(data)) {
    openInsightView(data.filePath);
  }
};
</script>

<template>
  <div class="tree-container">
    <a-directory-tree
      :tree-data="treeData"
      :show-line="false"
      :show-icon="false"
      :default-expand-all="true"
      :switcher-icon="SwitcherIcon"
      @select="onClickNode"
    >
      <template #title="{ dataRef }">
        <div class="custom-tree-node">
          <div class="tree-node-title">{{ dataRef.title }}</div>
          <template v-if="isRunData(dataRef)">
            <div class="tree-node-timestamp">
              {{ formatTimestamp(dataRef.timestamp) }}
            </div>
            <div class="run-data-operations">
              <!-- 下载 -->
              <a-button type="text" :icon="h(DownloadOutlined)" @click.stop="handleClickDownload(dataRef)"></a-button>
              <!-- 标记/取消标记 -->
              <a-button
                :class="{ marked: dataRef.marked }"
                type="text"
                :icon="h(MarkedIcon, { marked: dataRef.marked })"
                @click.stop="handleToggleMarked(dataRef, !dataRef.marked)"
              ></a-button>
            </div>
          </template>
        </div>
      </template>
    </a-directory-tree>
  </div>
</template>

<style lang="less" scoped>
.tree-container {
  width: 100%;
  position: relative;

  :deep(.ant-tree) {
    color: #fff;
    background: transparent;

    .ant-tree-treenode {
      .custom-tree-node {
        color: #fff;
        width: 100%;
        position: relative;

        .tree-node-title {
          color: #fff;
        }

        .tree-node-timestamp {
          color: rgba(255, 255, 255, 0.65);
          font-size: 12px;
          margin-top: 4px;
          line-height: 16px;
        }

        .run-data-operations {
          pointer-events: none;
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          display: flex;
          align-items: center;
          gap: 4px;

          > * {
            transition: opacity 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
            opacity: 0;
          }

          > .marked {
            opacity: 1;
          }
        }
      }

      &:hover {
        .run-data-operations {
          pointer-events: all;

          > * {
            opacity: 1;
          }
        }
      }
    }
  }
}
</style>
