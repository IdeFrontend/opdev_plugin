<template>
  <a-config-provider :theme="themeConfig">
    <div class="flex h-full" :class="isDark ? 'theme-dark' : 'theme-light'">
      <!-- 左侧：报告列表（原异常检测结果可视化） -->
      <div class="w-[260px] shrink-0 flex flex-col border-r" :class="getBorderClass()">
        <div class="leading-6 px-3 flex justify-between items-center" :class="getBgLightClass()">
          <span :class="getTextClass()">{{ t('web.sanitizerPanel.sanitizerResult') }}</span>
        </div>
        <div class="flex gap-2 my-3 px-3">
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
          class="flex-1 overflow-auto"
        >
          <div
            v-for="(item, index) in renderListData"
            :key="index"
            class="h-[50px] w-full px-3 py-1.5 flex cursor-pointer transition-all duration-100 group"
            :class="[getBgHoverClass(), { 'bg-white/15': selectedReportPath === item.path }]"
            @click="handleSelectReport(item)"
          >
            <div class="flex-1 text-xs min-w-0">
              <p class="leading-[22px] m-0 truncate" :class="getTextClass()">
                {{ item.title }}
              </p>
              <p class="leading-4 m-0" :class="getTextSecondaryClass()">
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
          class="flex-1 flex items-center justify-center text-sm"
          :class="getTextMutedClass()"
        >
          {{ t('web.sanitizerPanel.noReport') }}
        </div>
      </div>
      <!-- 右侧：选中报告的检测结果 -->
      <div
        v-if="msScantinizerInfo.title"
        class="flex-1 flex h-full min-w-0"
      >
        <div class="flex-1 h-full overflow-hidden flex flex-col">
          <div
            class="leading-6 px-5 flex justify-between items-center"
            :class="getBgLightClass()"
          >
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.detectionResult') }}</span>
            <LeftSquareOutlined
              v-if="!showDetail"
              class="cursor-pointer"
              @click="showDetail = true"
            />
          </div>
        <div class="h-14 flex justify-between items-center px-5">
          <div class="text-sm" :class="getTextClass()">
            {{ msScantinizerInfo.title }}
          </div>
          <div class="ms-panel-title-right">
            <a-popover placement="bottomRight">
              <template #content>
                <div class="w-[378px]">
                  <p class="text-sm m-0" :class="getTextClass()">
                    {{ t('web.sanitizerPanel.detectionInfo') }}
                  </p>
                  <p class="text-xs leading-4 py-0.5 m-0" :class="getTextMutedClass()">
                    {{ t('web.sanitizerPanel.detectionTime') }}
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0" :class="getTextClass()">
                    {{ formatTimestamp(msScantinizerInfo.timestamp) }}
                  </p>
                  <p class="text-xs leading-4 py-0.5 m-0" :class="getTextMutedClass()">
                    {{ t('web.sanitizerPanel.detectionContent') }}
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0" :class="getTextClass()">
                    {{ t('web.sanitizerPanel.detectionContentDesc') }}
                  </p>
                  <p class="text-xs leading-4 py-0.5 m-0" :class="getTextMutedClass()">
                    {{ t('web.sanitizerPanel.detectionScope') }}
                  </p>
                  <p class="leading-4 text-xs py-0.5 m-0" :class="getTextClass()">
                    {{ t('web.sanitizerPanel.globalMonitor') }}
                  </p>
                </div>
              </template>
              <InfoCircleOutlined class="cursor-pointer" :class="getTextSecondaryClass()" />
            </a-popover>
          </div>
        </div>
        <div class="flex mb-1 px-5">
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('error')"
          >
            <span :class="getTextClass()">
              <CloseCircleOutlined style="color: #ff4d4f" />
            </span>
            <span class="pt-1" :class="getTextClass()">{{ errorCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('warning')"
          >
            <span :class="getTextClass()">
              <WarningOutlined style="color: #faad14" />
            </span>
            <span class="pt-1" :class="getTextClass()">{{ warningCount }}</span>
          </div>
          <a-divider
            style="height: 44px"
            type="vertical"
            :class="getBorderClass()"
          />
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('memory')"
          >
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.memory') }}</span>
            <span class="pt-1" :class="getTextClass()">{{ memoryCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('memoryContention')"
          >
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.memoryRace') }}</span>
            <span class="pt-1" :class="getTextClass()">{{ memoryContentionCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('uninitialized')"
          >
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.uninitialized') }}</span>
            <span class="pt-1" :class="getTextClass()">{{ uninitializedCount }}</span>
          </div>
          <div
            class="h-11 w-[60px] flex flex-col justify-center items-center mx-2 cursor-pointer transition-all duration-100 rounded"
            :class="getBgHoverClass()"
            @click="filterTableData('synchronize')"
          >
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.sync') }}</span>
            <span class="pt-1" :class="getTextClass()">{{ synchronizeCount }}</span>
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
                  {{ t('web.sanitizerPanel.hostSideHint') }}
                </span>
              </template>
              <template v-if="column.dataIndex === 'question'">
                <span>{{ questionMap.get(record.question) }}</span>
              </template>
              <template v-if="column.dataIndex === 'msAgentAiFix'">
                <a-button
                  type="link"
                  size="small"
                  class="p-0 h-auto"
                  @click.stop="handleMsAgentAiFix(record)"
                >
                  {{ getMsAgentAiFixLabel(record) }}
                </a-button>
              </template>
            </template>
          </a-table>
        </div>
      </div>
      <div
        v-if="showDetail"
        class="w-[400px] overflow-hidden"
      >
        <div class="leading-6 px-5" :class="getBgLightClass()">
          <span :class="getTextClass()">{{ t('web.sanitizerPanel.detail') }}</span>
          <RightSquareOutlined
            class="cursor-pointer"
            @click="showDetail = false"
          />
        </div>
        <div class="px-5 break-all">
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.problem') }}</span>
          </div>
          <div class="mt-2.5" :class="getTextClass()">
            {{ questionDetails.title }}
          </div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span :class="getTextSecondaryClass()">{{ t('web.sanitizerPanel.problemDetail') }}</span>
          </div>
          <div class="mt-2.5" :class="getTextClass()">
            {{ questionDetails.originData }}
          </div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1" />
            <span :class="getTextClass()">{{ t('web.sanitizerPanel.problemTypeDetail') }}</span>
          </div>
          <div class="mt-2.5" :class="getTextClass()">
            {{ questionMap.get(questionDetails.question || '') }}
          </div>
          <div class="mt-2.5" :class="getTextClass()">
            {{ questionHandlerMap.get(questionDetails.question || '') }}
          </div>
        </div>
      </div>
      </div>
      <div
        v-else
        class="flex-1 flex items-center justify-center text-sm"
        :class="[getTextMutedClass(), getBgEmptyClass()]"
      >
        {{ t('web.sanitizerPanel.selectReportHint') }}
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { t } from 'i18next';
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

// 主题相关的样式辅助函数
const isDark = computed(() => actualTheme.value === 'dark');

const msAgentSanitizerAiFixAvailable = ref(false);
type MsAgentAiFixState = 'queued' | 'connecting' | 'fixing' | 'running' | 'already_running' | 'fixed';
const msAgentAiFixStates = ref<Record<number, MsAgentAiFixState | undefined>>({});
const stateDots = ref('');
let stateDotsTimer: ReturnType<typeof setInterval> | undefined;

// 获取边框颜色类
const getBorderClass = () => isDark.value ? 'border-white/10' : 'border-gray-200';

// 获取背景色类
const getBgLightClass = () => isDark.value ? 'bg-white/10' : 'bg-gray-100';
const getBgHoverClass = () => isDark.value ? 'hover:bg-white/10' : 'hover:bg-gray-50';
const getBgSelectedClass = () => isDark.value ? 'bg-white/15' : 'bg-gray-200';
const getBgEmptyClass = () => isDark.value ? 'bg-white/5' : 'bg-gray-50';

// 获取文本颜色类
const getTextClass = () => isDark.value ? 'text-white' : 'text-[#1f1f1f]';
const getTextSecondaryClass = () => isDark.value ? 'text-[#87878b]' : 'text-gray-400';
const getTextMutedClass = () => isDark.value ? 'text-[#8e8e8f]' : 'text-gray-500';

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

  // 只发送可结构化克隆的纯数据，避免 DataCloneError
  const payload = {
    path: item.path,
    title: item.title ?? '',
    timestamp: item.timestamp ?? 0,
  };

  // 通过 VSCode API 发给扩展，触发右侧详情刷新
  vscode.postMessage({
    command: 'vscodeLoadMsSanitizerReport',
    data: JSON.parse(JSON.stringify(item)),
  });
};

const handleCopyReport = async (data: { path: string }) => {
  try {
    await navigator.clipboard.writeText(data.path);
    message.success(t('web.perf.pathCopied'));
  }
  catch (error) {
    console.error('复制路径失败:', error);
    message.error(t('web.perf.copyFailed'));
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

  const base: Record<string, unknown>[] = [
    {
      title: t('web.sanitizerPanel.problemDesc'),
      dataIndex: 'type',
      width: msAgentSanitizerAiFixAvailable.value ? '42%' : '50%',
      ellipsis: true,
      filterDropdownOpen: false,
      filteredValue: filtered.type || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.type?.includes(String(value)) ?? false,
    },
    {
      title: t('web.sanitizerPanel.problemType'),
      dataIndex: 'question',
      width: '12%',
      filters: questionTypes,
      filteredValue: filtered.question || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.question?.includes(String(value)) ?? false,
    },
    {
      title: t('web.sanitizerPanel.sourceFile'),
      dataIndex: 'fileLink',
      width: msAgentSanitizerAiFixAvailable.value ? '26%' : '30%',
      filters: allFilePath.value,
      filteredValue: filtered.fileLink || null,
      onFilter: (value: string | number | boolean, record: QuestionData) =>
        record.fileLink?.includes(String(value)) ?? false,
      ellipsis: true,
    },
    {
      title: t('web.sanitizerPanel.lineNumber'),
      dataIndex: 'row',
      width: '8%',
    },
  ];

  if (msAgentSanitizerAiFixAvailable.value) {
    base.push({
      title: t('web.sanitizerPanel.aiFix'),
      dataIndex: 'msAgentAiFix',
      width: '12%',
    });
  }

  return base;
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

const handleMsAgentAiFix = (record: QuestionData | Record<string, unknown>) => {
  const idx = (record as QuestionData).msAgentIndex;
  if (idx === undefined) {
    return;
  }

  vscode.postMessage({
    command: 'vscodeMsAgentAiFix',
    index: idx,
  });
};

const requestMsAgentAiFixStates = () => {
  vscode.postMessage({
    command: 'vscodeRequestMsAgentAiFixStates',
  });
};

const startStateDotsAnimation = () => {
  if (stateDotsTimer) {
    return;
  }
  const dotsFrames = ['.', '..', '...', ''];
  let frame = 0;
  stateDots.value = dotsFrames[frame];
  stateDotsTimer = setInterval(() => {
    frame = (frame + 1) % dotsFrames.length;
    stateDots.value = dotsFrames[frame];
  }, 350);
};

const stopStateDotsAnimation = () => {
  if (stateDotsTimer) {
    clearInterval(stateDotsTimer);
    stateDotsTimer = undefined;
  }
  stateDots.value = '';
};

const syncDotsAnimation = () => {
  const active = Object.values(msAgentAiFixStates.value)
    .some((state) => state === 'fixing' || state === 'running');
  if (active) {
    startStateDotsAnimation();
  }
  else {
    stopStateDotsAnimation();
  }
};

const getMsAgentAiFixLabel = (record: QuestionData): string => {
  const idx = record.msAgentIndex;
  if (idx === undefined) {
    return t('web.sanitizerPanel.aiFix');
  }
  const state = msAgentAiFixStates.value[idx];
  if (state === 'queued' || state === 'already_running') {
    return t('web.sanitizerPanel.queued');
  }
  if (state === 'connecting') {
    return t('web.sanitizerPanel.connecting');
  }
  if (state === 'fixing' || state === 'running') {
    return `${t('web.sanitizerPanel.fixing')}${stateDots.value}`;
  }
  if (state === 'fixed') {
    return t('web.sanitizerPanel.fixed');
  }
  return t('web.sanitizerPanel.aiFix');
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
      msAgentAiFixStates.value = {};
      requestMsAgentAiFixStates();
      setTimeout(() => {
        requestMsAgentAiFixStates();
      }, 250);
      if (path) {
        selectedReportPath.value = path;
      }
    }
    if (event.data.command === 'iframeFlashMsSanitizerRunData') {
      getListData();
    }
    if (event.data.command === 'iframeMsAgentSanitizerIntegration') {
      msAgentSanitizerAiFixAvailable.value = Boolean(event.data.available);
    }
    if (event.data.command === 'iframeMsAgentAiFixStates') {
      const raw = (event.data.snapshot?.states ?? event.data.states ?? {}) as Record<string, unknown>;
      if (Object.keys(raw).length === 0) {
        msAgentAiFixStates.value = {};
        syncDotsAnimation();
      }
      else {
        // Merge so rows still in "connecting" (before ms-agent reports them) are not cleared
        // when the snapshot only includes other indices.
        const next: Record<number, MsAgentAiFixState> = { ...msAgentAiFixStates.value };
        for (const [k, v] of Object.entries(raw)) {
          const i = Number(k);
          if (!Number.isInteger(i) || i < 0) {
            continue;
          }
          const sv = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
          if (sv === 'running') {
            next[i] = 'fixing';
          }
          else if (sv === 'queued') {
            next[i] = 'queued';
          }
          else if (sv === 'fixed') {
            next[i] = 'fixed';
          }
        }
        // Drop only stale **fixing** when ms-agent no longer lists that index (row finished).
        // Do not prune **queued**: snapshot uses each task's sanitizerIndex; a second table row
        // can be locally "queued" while the server only reports the first enqueued index (same diagnostic key).
        const rawKeys = new Set(Object.keys(raw));
        for (const keyStr of Object.keys(next)) {
          const i = Number(keyStr);
          const s = next[i];
          if (s === 'fixing' && !rawKeys.has(String(i))) {
            delete next[i];
          }
        }
        msAgentAiFixStates.value = next;
        syncDotsAnimation();
      }
    }
    if (event.data.command === 'iframeMsAgentAiFixState') {
      const index = Number(event.data.index);
      const rawStatus = String(event.data.status || '');
      const status = rawStatus === 'completed' ? 'fixed' : rawStatus;
      if (Number.isInteger(index)) {
        if (
          status === 'queued'
          || status === 'connecting'
          || status === 'fixing'
          || status === 'running'
          || status === 'already_running'
          || status === 'fixed'
        ) {
          msAgentAiFixStates.value = {
            ...msAgentAiFixStates.value,
            [index]: status as MsAgentAiFixState,
          };
        }
        else {
          const rest = { ...msAgentAiFixStates.value };
          delete rest[index];
          msAgentAiFixStates.value = rest;
        }
      }

      syncDotsAnimation();
    }
  };

  window.addEventListener('message', messageHandler);

  window.postMessage({ command: 'vscodeRequestMsAgentSanitizerIntegration' }, '*');

  // 请求初始数据（如从“打开面板”命令带入的报告）
  window.postMessage({ command: 'vscodeGetMsSanitizerPanelViewData' }, '*');
  requestMsAgentAiFixStates();

  onBeforeUnmount(() => {
    window.removeEventListener('message', messageHandler);
    msAgentAiFixStates.value = {};
    stopStateDotsAnimation();
  });
});
</script>

<style lang="less" scoped>
.execute-time-sorter-button {
  border-radius: 2px;
}

// 深色主题样式
:deep(.theme-dark .execute-time-sorter-button):hover,
:deep(.theme-dark .execute-time-sorter-button):focus,
:deep(.theme-dark .execute-time-sorter-button):active {
  background-color: rgba(20, 20, 20, 0.96) !important;
  border-color: rgb(72, 72, 73) !important;
  color: rgba(255, 255, 255, 0.855) !important;
  box-shadow: rgba(255, 255, 255, 0.04) !important;
}

// 浅色主题样式
:deep(.theme-light .execute-time-sorter-button):hover,
:deep(.theme-light .execute-time-sorter-button):focus,
:deep(.theme-light .execute-time-sorter-button):active {
  background-color: #f5f5f5 !important;
  border-color: #d9d9d9 !important;
  color: #1f1f1f !important;
  box-shadow: rgba(0, 0, 0, 0.04) !important;
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
