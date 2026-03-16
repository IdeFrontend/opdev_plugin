<script setup lang="ts">
import { t } from 'i18next';
import {
  UpOutlined,
  CaretUpFilled,
  DownOutlined,
  CaretDownFilled,
  FlagOutlined,
  FlagFilled,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue';
import {
  Component, h, ref, computed, onMounted, onBeforeUnmount,
} from 'vue';
import { formatTimestamp } from '@web/views/sidebars/performance-run-data/utils/timestamp';
import {
  getMsSanitizerRunData,
  toggleMsSanitizerMark,
  openMsSanitizerPanel,
  downloadMsSanitizerReport,
} from '@web/apis';
import {
  message,
} from 'ant-design-vue';
import { useTheme } from '@web/composables/use-theme';

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();

const sortOrder = ref<'asc' | 'desc'>('desc');
const isMarkedOnly = ref<boolean>(false);
const listData = ref<any[]>([]);

const renderListData = computed(() => {
  const data = listData.value.filter((item) => {
    if (isMarkedOnly.value) {
      return item.marked;
    }

    return true;
  });

  return data.sort((a, b) =>
    sortOrder.value === 'asc'
      ? b.timestamp - a.timestamp
      : a.timestamp - b.timestamp);
});

const handleExecutionTime = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
};

const filterMark = () => {
  isMarkedOnly.value = !isMarkedOnly.value;
};

const handleClick = (data) => {
  openMsSanitizerPanel(data);
};

const handleMark = async (data) => {
  await toggleMsSanitizerMark(data);
  getListData();
};

// 标记图标组件
const MarkedIcon: Component = ({ marked }) =>
  h(marked ? FlagFilled : FlagOutlined, { style: { color: marked ? '#d32029' : undefined } });

const handleCopyReport = async (data) => {
  try {
    await navigator.clipboard.writeText(data.path);
    message.success(t('web.perf.pathCopied'));
  }
  catch (error) {
    console.error('复制路径失败:', error);
    message.error(t('web.perf.copyFailed'));
  }
};

const handleDownloadReport = async (data) => {
  try {
    const hide = message.loading(t('web.perf.preparingDownload'), 0);

    try {
      await downloadMsSanitizerReport({ path: data.path });
      message.success(t('web.perf.downloadSuccess'));
    }
    catch (error) {
      console.error('下载报告失败:', error);
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
};

const getListData = async () => {
  listData.value = await getMsSanitizerRunData({});
};

const eventListenerHandler = (event) => {
  if (event.data.command === 'iframeFlashMsSanitizerRunData') {
    getListData();
  }
};

// 添加全局消息监听 监听刷新列表数据
const addEventListener = () => {
  window.addEventListener('message', eventListenerHandler);
};

onMounted(() => {
  getListData();
  addEventListener();
});

onBeforeUnmount(() => {
  window.removeEventListener('message', eventListenerHandler);
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="flex flex-col">
      <div class="flex gap-2 my-3">
        <a-button
          type="default"
          class="execute-time-sorter-button"
          @click="handleExecutionTime"
        >
          <div class="flex items-center">
            {{ t('web.perf.executionTime') }}
            <div class="sort-icons">
              <CaretUpFilled v-if="sortOrder === 'asc'" />
              <UpOutlined v-else />
              <CaretDownFilled v-if="sortOrder === 'desc'" />
              <DownOutlined v-else />
            </div>
          </div>
        </a-button>
        <a-button
          class="execute-time-sorter-button"
          @click="filterMark"
        >
          {{ t('web.perf.marked') }}
          <FlagFilled
            v-if="isMarkedOnly"
            class="flag-outlined-icon"
          />
          <FlagOutlined
            v-else
            class="flag-outlined-icon"
          />
        </a-button>
      </div>
      <div
        v-if="renderListData.length > 0"
        class="flex-1 overflow-auto w-full"
      >
        <div
          v-for="(item, index) in renderListData"
          :key="index"
          class="h-[50px] w-full px-6 py-1.5 flex cursor-pointer transition-all duration-100 hover:bg-white/10 group"
          @click="handleClick(item)"
        >
          <div class="flex-1 text-xs">
            <p class="text-white leading-[22px] m-0">
              {{ item.title }}
            </p>
            <p class="text-[#87878b] leading-4 m-0">
              {{ formatTimestamp(item.timestamp) }}
            </p>
          </div>
          <div
            class="flex gap-1 justify-center items-center pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto"
          >
            <!-- 复制报告 -->
            <a-button
              type="text"
              :icon="h(CopyOutlined)"
              @click.stop="handleCopyReport(item)"
            />
            <!-- 下载报告 -->
            <!-- <a-button
              type="text"
              :icon="h(DownloadOutlined)"
              @click.stop="handleDownloadReport(item)"
            /> -->
            <!-- 标记/取消标记 -->
            <a-button
              :class="{ 'opacity-100': item.marked }"
              type="text"
              :icon="h(MarkedIcon, { marked: item.marked })"
              @click.stop="handleMark(item)"
            />
          </div>
        </div>
      </div>
      <div
        v-else
        style="text-align: center; margin-top: 20px"
      >
        {{ t('web.perf.noData') }}
      </div>
    </div>
  </a-config-provider>
</template>

<style scoped>
.execute-time-sorter-button {
  border-radius: 2px;
}

.execute-time-sorter-button:hover,
.execute-time-sorter-button:focus,
.execute-time-sorter-button:active {
  background-color: rgba(20, 20, 20, 0.96) !important;
  border-color: rgb(72, 72, 73) !important;
  color: rgba(255, 255, 255, 0.855) !important;
  box-shadow: rgba(255, 255, 255, 0.04) !important;
}

.sort-icons {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 4px;
}

.sort-icons :deep(.anticon) {
  display: block;
  width: 10px;
  height: 10px;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  border-style: solid;
  border-color: rgba(225, 225, 225, 0.85);
  border-width: 0;
  position: relative;
}

.sort-icons :deep(.anticon svg) {
  position: absolute;
  left: 0;
}

.sort-icons :deep(.anticon-caret-up),
.sort-icons :deep(.anticon-caret-down) {
  font-size: 14px;
}

.sort-icons :deep(.anticon-caret-up svg),
.sort-icons :deep(.anticon-caret-down svg) {
  margin: -2px;
}

.sort-icons :deep(.anticon-up),
.sort-icons :deep(.anticon-down) {
  font-size: 10px;
}

.sort-icons :deep(.anticon-up),
.sort-icons :deep(.anticon-caret-up) {
  border-bottom-width: 1px;
}

.sort-icons :deep(.anticon-up svg),
.sort-icons :deep(.anticon-caret-up svg) {
  bottom: -2px;
}

.sort-icons :deep(.anticon-down),
.sort-icons :deep(.anticon-caret-down) {
  border-top-width: 1px;
}

.sort-icons :deep(.anticon-down svg),
.sort-icons :deep(.anticon-caret-down svg) {
  top: -2px;
}

.flag-outlined-icon {
  position: relative;
  bottom: 2px;
}
</style>
