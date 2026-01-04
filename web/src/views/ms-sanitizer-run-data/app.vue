<script setup lang="ts">
import {
  UpOutlined,
  CaretUpFilled,
  DownOutlined,
  CaretDownFilled,
  FlagOutlined,
  FlagFilled,
} from '@ant-design/icons-vue';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { formatTimestamp } from '../performance-run-data/utils/timestamp';
import {
  getMsSanitizerRunData,
  toggleMsSanitizerMark,
  openMsSanitizerPanel,
} from '../../apis';

const sortOrder = ref<'asc' | 'desc'>('asc');
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
      : a.timestamp - b.timestamp,
  );
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
  <div class="flex flex-col">
    <div class="flex gap-2 my-3">
      <a-button
        class="group hover:[&_.anticon]:!border-[#1890ff]"
        type="default"
        size="small"
        @click="handleExecutionTime"
      >
        <div class="flex items-center">
          执行时间
          <div class="inline-flex flex-col gap-[2px] ml-1">
            <div class="sort-icon-wrapper border-b border-white/85">
              <CaretUpFilled v-if="sortOrder === 'asc'" class="text-sm -m-[2px]" />
              <UpOutlined v-else class="text-[10px] relative -bottom-[2px]" />
            </div>
            <div class="sort-icon-wrapper border-t border-white/85">
              <CaretDownFilled v-if="sortOrder === 'desc'" class="text-sm -m-[2px]" />
              <DownOutlined v-else class="text-[10px] relative -top-[2px]" />
            </div>
          </div>
        </div>
      </a-button>
      <a-button
        :type="isMarkedOnly ? 'primary' : 'default'"
        size="small"
        @click="filterMark"
      >
        已标记
        <FlagFilled v-if="isMarkedOnly" />
        <FlagOutlined v-else />
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
          <p class="text-white leading-[22px] m-0">{{ item.title }}</p>
          <p class="text-[#87878b] leading-4 m-0">
            {{ formatTimestamp(item.timestamp) }}
          </p>
        </div>
        <div class="flex justify-center items-center pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto">
          <FlagFilled
            v-if="item.marked"
            class="text-[#d32029] opacity-100"
            @click.stop="handleMark(item)"
          />
          <FlagOutlined
            v-else
            @click.stop="handleMark(item)"
          />
        </div>
      </div>
    </div>
    <div
      v-else
      style="text-align: center; margin-top: 20px"
    >
      暂无数据
    </div>
  </div>
</template>

<style scoped>
.sort-icon-wrapper {
  display: block;
  width: 10px;
  height: 10px;
  transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  border-style: solid;
  border-color: rgba(225, 225, 225, 0.85);
  border-left-width: 0;
  border-right-width: 0;
  position: relative;
}
</style>
