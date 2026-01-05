<template>
  <a-config-provider :theme="themeConfig">
    <div
      v-if="msScantinizerInfo.title"
      class="flex h-full"
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
          <div class="text-sm">{{ msScantinizerInfo.title }}</div>
          <div class="ms-panel-title-right">
            <a-popover placement="bottomRight">
              <template #content>
                <div class="w-[378px]">
                  <p class="text-sm m-0">检测信息</p>
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
                  <p class="leading-4 text-xs py-0.5 m-0">全局监测</p>
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
                  @click.stop="handleJumpToFile(record as any)"
                  >{{ record.fileLink }}</a-button
                >
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
            <div class="h-2.5 w-1 bg-white mr-1"></div>
            <span>问题</span>
          </div>
          <div class="mt-2.5">{{ questionDetails.title }}</div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1"></div>
            <span>问题详情</span>
          </div>
          <div class="mt-2.5">
            {{ questionDetails.originData }}
          </div>
          <div class="flex items-center mt-5">
            <div class="h-2.5 w-1 bg-white mr-1"></div>
            <span>问题类型详情</span>
          </div>
          <div class="mt-2.5">
            {{ questionMap.get(questionDetails.question) }}
          </div>
          <div class="mt-2.5">
            {{ questionHandlerMap.get(questionDetails.question) }}
          </div>
        </div>
      </div>
    </div>
    <div v-else>请选择异常检测日志查看详情</div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { theme } from 'ant-design-vue';
import {
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  RightSquareOutlined,
  LeftSquareOutlined,
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
import { jumpToFileWebview } from '@/apis';
import { formatTimestamp } from '../performance-run-data/utils/timestamp';

const themeConfig = {
  algorithm: theme.darkAlgorithm,
};

const questionTypes = Array.from(questionMap).map((item) => ({
  text: item[1],
  value: item[0],
}));

const msScantinizerInfo = ref<Record<string, string>>({});

const filteredInfo = ref<any>({});

const questionDetails = ref<any>({});

const showDetail = ref(false);

const allFilePath = computed(() => {
  const filaPathSet = new Set<string>();

  tableData.value.forEach((item) => {
    if (item.fileLink) {
      filaPathSet.add(item.fileLink);
    }
  });

  return Array.from(filaPathSet).map((item) => ({ text: item, value: item }));
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
      onFilter: (value: any, record: QuestionData) =>
        record.type?.includes(value) ?? false,
    },
    {
      title: '问题类型',
      dataIndex: 'question',
      width: '12%',
      filters: questionTypes,
      filteredValue: filtered.question || null,
      onFilter: (value: any, record: QuestionData) =>
        record.question?.includes(value) ?? false,
    },
    {
      title: '源码文件',
      dataIndex: 'fileLink',
      width: '30%',
      filters: allFilePath.value,
      filteredValue: filtered.fileLink || null,
      onFilter: (value: any, record: QuestionData) =>
        record.fileLink?.includes(value) ?? false,
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

const customRow = (record) => {
  return {
    onClick: () => {
      questionDetails.value = record;
      showDetail.value = true;
    },
  };
};

const handleJumpToFile = async (data: QuestionData) => {
  if (!data.fileLink || data.row === undefined || data.col === undefined) {
    console.warn('无法跳转：缺少必要的文件信息');

    return;
  }
  try {
    await jumpToFileWebview({
      fileLink: data.fileLink,
      row: data.row,
      col: data.col,
    });
  } catch (error) {
    console.error('跳转到文件失败:', error);
  }
};

function onChange(pagination, filters) {
  filteredInfo.value = filters || {};
}

const filterTableData = async (type) => {
  switch (type) {
    case 'memory':
      filteredInfo.value = {
        question: Array.from(memorySet),
      };
      break;
    case 'memoryContention':
      filteredInfo.value = {
        question: Array.from(memoryContentionSet),
      };
      break;
    case 'uninitialized':
      filteredInfo.value = {
        question: Array.from(uninitializedSet),
      };
      break;
    case 'synchronize':
      filteredInfo.value = {
        question: Array.from(synchronizeSet),
      };
      break;
    case 'error':
      filteredInfo.value = {
        type: ['error'],
      };
      break;
    case 'warning':
      filteredInfo.value = {
        type: ['warning'],
      };
      break;

    default:
      break;
  }
};

onMounted(() => {
  // 监听来自 iframe 的消息
  const messageHandler = (event: MessageEvent) => {
    if (
      event.data.command === 'iframeRemoteMsSanitizerPanelViewSetRenderList'
    ) {
      const { data, title, timestamp } = event.data.data;

      msScantinizerInfo.value = {
        title,
        timestamp,
      };
      tableData.value = data || [];
    }
  };

  window.addEventListener('message', messageHandler);

  // 发送消息给父窗口请求数据
  window.postMessage({ command: 'vscodeGetMsSanitizerPanelViewData' }, '*');

  // 清理函数
  onBeforeUnmount(() => {
    window.removeEventListener('message', messageHandler);
  });
});
</script>

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
