<script setup lang="ts">
import { t } from 'i18next';
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
  Component, h, ref, watch, inject, computed,
} from 'vue';
import { message } from 'ant-design-vue';

import {
  PerformanceExecutionRecord,
  PerformanceRunDataFile,
} from '@shared/api-types';

import {
  openCsvView, openInsightView, saveFileToLocal,
} from '@web/apis';

import { formatTimestamp } from '@web/views/sidebars/performance-run-data/utils/timestamp';

// 从父组件注入主题状态
const actualTheme = inject('actualTheme', computed(() => 'dark'));

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
  const iconColor = actualTheme.value === 'dark' ? '#fff' : '#1f1f1f';

  return h(expanded ? DownOutlined : RightOutlined, {
    style: {
      fontSize: '12px',
      color: iconColor,
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

async function handleCopyReport(record: PerformanceExecutionRecord) {
  try {
    await navigator.clipboard.writeText(record.dirPath);
    message.success(t('web.perf.pathCopied'));
  }
  catch (error) {
    console.error('复制路径失败:', error);
    message.error(t('web.perf.copyFailed'));
  }
}

/**
 * 处理下载点击
 */
async function handleClickDownload(record: PerformanceExecutionRecord) {
  try {
    // 从 dirPath 中提取目录名作为文件名
    const dirPath = record.dirPath;
    const dirName = dirPath
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || 'download';
    const filename = `${dirName}.zip`;

    console.log('开始下载，路径:', dirPath, '文件名:', filename);

    // 显示加载提示
    const hide = message.loading(t('web.perf.preparingDownload'), 0);

    try {
      const result = await saveFileToLocal({
        sourcePath: dirPath,
        filename,
        dialogTitle: t('web.perf.saveFile'),
        allowedTypes: ['zip'],
      });

      console.log('下载API返回结果:', result);

      if (result) {
        // 延迟一下再显示成功消息，确保下载已开始
        setTimeout(() => {
          message.success(t('web.perf.downloadSuccess'));
        }, 500);
      }
      else {
        message.warning(t('web.perf.downloadCancelled'));
      }
    }
    catch (error) {
      console.error('下载失败:', error);
      message.error(error instanceof Error ? error.message : t('web.perf.downloadFailed'));
    }
    finally {
      hide();
    }
  }
  catch (error) {
    console.error('下载处理失败:', error);
    message.error(t('web.perf.downloadFailedGeneric'));
  }
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
    class="w-full relative"
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
          class="w-full relative group flex items-center"
          style="padding-right: 100px;"
          :class="{ 'pr-8': isRootDir(dataRef) }"
        >
          <div
            class="w-full overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {{ dataRef.title }}
          </div>
          <template v-if="isRootDir(dataRef)">
            <div
              class="text-xs mt-1 leading-4 absolute bottom-[-16px] left-0 hidden"
            >
              {{ formatTimestamp(dataRef.timestamp) }}
            </div>
            <div
              class="pointer-events-none absolute top-0 right-0 h-full flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto"
            >
              <!-- 复制报告 -->
              <a-button
                type="text"
                :icon="h(CopyOutlined)"
                @click.stop="handleCopyReport(dataRef)"
              />
              <!-- 下载报告 -->
              <a-button
                type="text"
                :icon="h(DownloadOutlined)"
                @click.stop="handleClickDownload(dataRef)"
              />
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
