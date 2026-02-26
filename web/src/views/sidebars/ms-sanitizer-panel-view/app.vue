<template>
  <a-config-provider :theme="themeConfig">
    <div class="flex h-full">
      <!-- 左侧：报告列表（原异常检测结果可视化） -->
      <div class="w-[260px] shrink-0 flex flex-col border-r border-white/10">
        <div class="leading-6 bg-white/10 px-3 flex justify-between items-center">
          <span>异常检测结果</span>
        </div>
        <div class="flex gap-2 my-3 px-3">
          <a-button
            type="default"
            class="execute-time-sorter-button"
            @click="handleExecutionTime"
          >
            <div class="flex items-center">
              执行时间
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
            已标记
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
          class="flex-1 overflow-auto"
        >
          <div
            v-for="(item, index) in renderListData"
            :key="index"
            class="h-[50px] w-full px-3 py-1.5 flex cursor-pointer transition-all duration-100 hover:bg-white/10 group"
            :class="{ 'bg-white/15': selectedReportPath === item.path }"
            @click="handleSelectReport(item)"
          >
            <div class="flex-1 text-xs min-w-0">
              <p class="text-white leading-[22px] m-0 truncate">
                {{ item.title }}
              </p>
              <p class="text-[#87878b] leading-4 m-0">
                {{ formatTimestamp(item.timestamp) }}
              </p>
            </div>
            <div
              class="flex gap-1 justify-center items-center pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto shrink-0"
            >
              <a-button
                type="text"
                :icon="h(CopyOutlined)"
                @click.stop="handleCopyReport(item)"
              />
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
          class="flex-1 flex items-center justify-center text-[#8e8e8f] text-sm"
        >
          暂无报告
        </div>
      </div>
      <!-- 右侧：选中报告的检测结果 -->
      <div
        v-if="msScantinizerInfo.title"
        class="flex-1 flex h-full min-w-0"
      >
        <div class="flex-1 h-full overflow-hidden flex flex-col">
          <div
            class="leading-6 bg-white/10 px-5 flex justify-between items-center"
          >
            <span>检测结果</span>
            <LeftSquareOutlined
              v-if="!showDetail"
              class="cursor-pointer"
              @click="showDetail = true"
            />
          </div>
        <div class="h-14 flex justify-between items-center px-5">
          <div class="text-sm">
            {{ msScantinizerInfo.title }}
          </div>
          <div class="ms-panel-title-right">
            <a-popover placement="bottomRight">
              <template #content>
                <div class="w-[378px]">
                  <p class="text-sm m-0">
                    检测信息
                  </p>
                  <p class="text-[#8e8e8f] text-xs leading-4 py-0.5 m-0">
                    检测时间
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0">
                    {{ formatTimestamp(msScantinizerInfo.timestamp) }}
                  </p>
                  <p class="text-[#8e8e8f] text-xs leading-4 py-0.5 m-0">
                    检测内容
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0">
                    内存检测：非法读写、多核踩踏、非对齐访问和非法释放，内存泄漏、分配内存未使用、Device侧内存检测、CANN软件栈内存检测、竞争检测、未初始化监测
                  </p>
                  <p class="text-[#8e8e8f] text-xs leading-4 py-0.5 m-0">
                    检测范围
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0">
                    全局监测
                  </p>
                </div>
              </template>
              <InfoCircleOutlined class="cursor-pointer" />
            </a-popover>
          </div>
        </div>
        <div class="flex mb-1 px-5">
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('error')"
          >
            <span>
              <CloseCircleOutlined style="color: #ff4d4f" />
            </span>
            <span class="pt-1">{{ errorCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('warning')"
          >
            <span>
              <WarningOutlined style="color: #faad14" />
            </span>
            <span class="pt-1">{{ warningCount }}</span>
          </div>
          <a-divider
            style="height: 44px"
            type="vertical"
          />
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('memory')"
          >
            <span>内存</span>
            <span class="pt-1">{{ memoryCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('memoryContention')"
          >
            <span>内存竞争</span>
            <span class="pt-1">{{ memoryContentionCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('uninitialized')"
          >
            <span>未初始化</span>
            <span class="pt-1">{{ uninitializedCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded hover:bg-white/10"
            @click="filterTableData('synchronize')"
          >
            <span>同步</span>
            <span class="pt-1">{{ synchronizeCount }}</span>
          </div>
        </div>
        <div style="padding: 0 20px">
          <a-table
            :scroll="{ y: 'calc(100vh - 224px)' }"
            :columns="columns"
            :data-source="tableData"
            size="small"
            :custom-row="customRow"
            @change="onChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'type'">
                <CloseCircleOutlined
                  v-if="record.type === 'error'"
                  style="color: #ff4d4f"
                />
                <WarningOutlined
                  v-else
                  style="color: #faad14"
                />
                <span style="padding-left: 4px">{{ record.title }}</span>
              </template>
              <template v-if="column.dataIndex === 'fileLink'">
                <a-button
                  v-if="record.fileLink"
                  type="link"
                  @click.stop="handleJumpToFile(record)"
                >
                  {{ record.fileLink }}
                </a-button>
                <span v-else>
                  该问题为HOST侧的问题，按照右侧详情信息进行排查。
                </span>
              </template>
              <template v-if="column.dataIndex === 'question'">
                <span>{{ questionMap.get(record.question) }}</span>
              </template>
            </template>
          </a-table>
        </div>
      </div>
      <div
        v-if="showDetail"
        class="w-[400px] overflow-hidden"
      >
        <div class="leading-6 bg-white/10 px-5">
          详情
          <RightSquareOutlined
            class="cursor-pointer"
            @click="showDetail = false"
          />
        </div>
        <div class="px-5 break-all">
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span>问题</span>
          </div>
          <div class="mt-2.5">
            {{ questionDetails.title }}
          </div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span>问题详情</span>
          </div>
          <div class="mt-2.5">
            {{ questionDetails.originData }}
          </div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span>问题类型详情</span>
          </div>
          <div class="mt-2.5">
            {{ questionMap.get(questionDetails.question || '') }}
          </div>
          <div class="mt-2.5">
            {{ questionHandlerMap.get(questionDetails.question || '') }}
          </div>
        </div>
      </div>
      </div>
      <div
        v-else
        class="flex-1 flex items-center justify-center text-[#8e8e8f] text-sm bg-white/5"
      >
        请选择左侧报告查看检测结果
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import {
  ref, computed, onBeforeUnmount, onMounted, type Component, h,
} from 'vue';
import { theme, message } from 'ant-design-vue';
import {
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  RightSquareOutlined,
  LeftSquareOutlined,
  UpOutlined,
  DownOutlined,
  CaretUpFilled,
  CaretDownFilled,
  FlagOutlined,
  FlagFilled,
  CopyOutlined,
} from '@ant-design/icons-vue';
import {
  questionMap,
  questionHandlerMap,
  type QuestionData,
  memorySet,
  memoryContentionSet,
  uninitializedSet,
  synchronizeSet,
} from './constant';
import {
  jumpToFileWebview,
  getMsSanitizerRunData,
  toggleMsSanitizerMark,
} from '@web/apis';
import { formatTimestamp } from '@web/views/sidebars/performance-run-data/utils/timestamp';
import { useTheme } from '@web/composables/use-theme';
import { vscode } from '@web/utils/vscode';

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();

// 左侧报告列表（原异常检测结果可视化）
const sortOrder = ref<'asc' | 'desc'>('desc');
const isMarkedOnly = ref(false);
const listData = ref<any[]>([]);
const selectedReportPath = ref<string | null>(null);

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

const getListData = async () => {
  listData.value = await getMsSanitizerRunData({});
};

/** 点击左侧报告，在右侧展示该报告的检测结果 */
const handleSelectReport = (item: { path: string; title?: string; timestamp?: number }) => {
  selectedReportPath.value = item.path;
  // 直接通过 VSCode API 发给扩展，确保能触发右侧详情刷新
  vscode.postMessage({
    command: 'vscodeLoadMsSanitizerReport',
    data: item,
  });
};

const handleCopyReport = async (data: { path: string }) => {
  try {
    await navigator.clipboard.writeText(data.path);
    message.success('路径已复制到剪贴板');
  }
  catch (error) {
    console.error('复制路径失败:', error);
    message.error('复制路径失败');
  }
};

const handleMark = async (data: any) => {
  await toggleMsSanitizerMark(data);
  getListData();
};

const MarkedIcon: Component<{ marked: boolean }> = ({ marked }) =>
  h(marked ? FlagFilled : FlagOutlined, { style: { color: marked ? '#d32029' : undefined } });

const questionTypes = Array.from(questionMap)
  .map((item) => ({
    text: item[1],
    value: item[0],
  }));

const msScantinizerInfo = ref<Record<string, string>>({});

const filteredInfo = ref<Record<string, string[] | null>>({});

const questionDetails = ref<Partial<QuestionData>>({});

const showDetail = ref(false);

const allFilePath = computed(() => {
  const filaPathSet = new Set<string>();

  tableData.value.forEach((item) => {
    if (item.fileLink) {
      filaPathSet.add(item.fileLink);
    }
  });

  return Array.from(filaPathSet)
    .map((item) => ({
      text: item,
      value: item,
    }));
});

const columns = computed(() => {
  const filtered = filteredInfo.value || {};

  return [
    {
      title: '问题描述',
      dataIndex: 'type',
      width: '50%',
      ellipsis: true,
      filterDropdownOpen: false,
      filteredValue: filtered.type || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.type?.includes(String(value)) ?? false,
    },
    {
      title: '问题类型',
      dataIndex: 'question',
      width: '12%',
      filters: questionTypes,
      filteredValue: filtered.question || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.question?.includes(String(value)) ?? false,
    },
    {
      title: '源码文件',
      dataIndex: 'fileLink',
      width: '30%',
      filters: allFilePath.value,
      filteredValue: filtered.fileLink || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.fileLink?.includes(String(value)) ?? false,
      ellipsis: true,
    },
    {
      title: '行数',
      dataIndex: 'row',
      width: '8%',
    },
  ];
});
const tableData = ref<QuestionData[]>([]);

const errorCount = computed(() => {
  return tableData.value.filter((item) => item.type === 'error').length || 0;
});

const warningCount = computed(() => {
  return tableData.value.filter((item) => item.type === 'warning').length || 0;
});

const memoryCount = computed(() => {
  return (
    tableData.value.filter((item) => item.questionType === 'memory').length || 0
  );
});

const memoryContentionCount = computed(() => {
  return (
    tableData.value.filter((item) => item.questionType === 'memoryContention')
      .length || 0
  );
});

const uninitializedCount = computed(() => {
  return (
    tableData.value.filter((item) => item.questionType === 'uninitialized')
      .length || 0
  );
});

const synchronizeCount = computed(() => {
  return (
    tableData.value.filter((item) => item.questionType === 'synchronize')
      .length || 0
  );
});

const customRow = (record: QuestionData) => {
  return {
    onClick: () => {
      questionDetails.value = record;
      showDetail.value = true;
      
      // 如果记录有文件链接，自动跳转并高亮显示错误信息
      if (record.fileLink && record.row !== undefined && record.col !== undefined) {
        handleJumpToFile(record);
      }
    },
  };
};

const handleJumpToFile = async (data: QuestionData | Record<string, any>) => {
  const questionData = data as QuestionData;

  if (!questionData.fileLink || questionData.row === undefined || questionData.col === undefined) {
    console.warn('无法跳转：缺少必要的文件信息');

    return;
  }

  try {
    // 构建错误信息，优先使用 title，如果没有则使用 originData
    const errorTitle = questionData.title || '';
    const errorMessage = questionData.originData || '';

    await jumpToFileWebview({
      fileLink: questionData.fileLink,
      row: questionData.row,
      col: questionData.col,
      errorTitle,
      errorMessage,
    });
  }
  catch (error) {
    console.error('跳转到文件失败:', error);
  }
};

function onChange(
  _pagination: unknown,
  filters: Record<string, (string | number | boolean)[] | null>,
) {
  // 转换 filter 类型以匹配 filteredInfo (Record<string, string[] | null>)
  const newFilters: Record<string, string[] | null> = {};

  Object.keys(filters)
    .forEach((key) => {
      const val = filters[key];

      if (val) {
        newFilters[key] = val.map(String);
      }
      else {
        newFilters[key] = null;
      }
    });
  filteredInfo.value = newFilters;
}

const filterTableData = async (type: string) => {
  switch (type) {
    case 'memory':
      filteredInfo.value = { question: Array.from(memorySet) };
      break;
    case 'memoryContention':
      filteredInfo.value = { question: Array.from(memoryContentionSet) };
      break;
    case 'uninitialized':
      filteredInfo.value = { question: Array.from(uninitializedSet) };
      break;
    case 'synchronize':
      filteredInfo.value = { question: Array.from(synchronizeSet) };
      break;
    case 'error':
      filteredInfo.value = { type: ['error'] };
      break;
    case 'warning':
      filteredInfo.value = { type: ['warning'] };
      break;

    default:
      break;
  }
};

onMounted(() => {
  getListData();

  const messageHandler = (event: MessageEvent) => {
    if (
      event.data.command === 'iframeRemoteMsSanitizerPanelViewSetRenderList'
    ) {
      const payload = event.data.data || {};
      const { data, title, timestamp, path } = payload;

      msScantinizerInfo.value = title
        ? { title, timestamp: String(timestamp ?? '') }
        : {};
      tableData.value = data || [];
      if (path) {
        selectedReportPath.value = path;
      }
    }
    if (event.data.command === 'iframeFlashMsSanitizerRunData') {
      getListData();
    }
  };

  window.addEventListener('message', messageHandler);

  // 请求初始数据（如从“打开面板”命令带入的报告）
  window.postMessage({ command: 'vscodeGetMsSanitizerPanelViewData' }, '*');

  onBeforeUnmount(() => {
    window.removeEventListener('message', messageHandler);
  });
});
</script>

<style lang="less" scoped>
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
}
.flag-outlined-icon {
  position: relative;
  bottom: 2px;
}
</style>

<style lang="less">
#app {
  height: 100% !important;
  width: 100% !important;
  overflow: hidden;
}
body {
  padding: 0 !important;
}
</style>
