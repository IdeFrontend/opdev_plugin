<script setup lang="ts">
import { UpOutlined, CaretUpFilled, DownOutlined, CaretDownFilled, FlagOutlined, FlagFilled } from '@ant-design/icons-vue';
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { formatTimestamp } from "../PerformanceRunData/utils/timestamp";
import { getMsSanitizerRunData, toggleMsSanitizerMark, openMsSanitizerPanel } from '../../apis'

const sortOrder = ref<'asc' | 'desc'>('asc');
const isMarkedOnly = ref<boolean>(false);
const listData = ref<any[]>([])

const renderListData = computed(() => {
  const data = listData.value.filter(item => {
    if (isMarkedOnly.value) {
      return item.marked
    }
    return true;
  })
  return data.sort((a, b) => sortOrder.value === 'asc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp)
})

const handleExecutionTime = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
};

const filterMark = () => {
  isMarkedOnly.value = !isMarkedOnly.value;
};

const handleClick = (data) => {
  openMsSanitizerPanel(data);
}

const handleMark = async (data) => {
  await toggleMsSanitizerMark(data);
  getListData();
}

const getListData = async () => {
  listData.value = await getMsSanitizerRunData({});
}

const eventListenerHandler = event => {
  if (event.data.command === 'iframeFlashMsSanitizerRunData') {
    getListData();
  }
}

// 添加全局消息监听 监听刷新列表数据
const addEventListener = () => {
  window.addEventListener('message', eventListenerHandler);
}

onMounted(() => {
  getListData();
  addEventListener();
})

onBeforeUnmount(() => {
  window.removeEventListener('message', eventListenerHandler)
})
</script>

<template>
  <div class="ctn">
    <div class="filter-bar">
      <a-button class="time-sorter-button" type="default" @click="handleExecutionTime" size="small">
        <div class="time-sorter-inner">
          执行时间
          <div class="sort-icons">
            <CaretUpFilled v-if="sortOrder === 'asc'" />
            <UpOutlined v-else />
            <CaretDownFilled v-if="sortOrder === 'desc'" />
            <DownOutlined v-else />
          </div>
        </div>
      </a-button>
      <a-button :type="isMarkedOnly ? 'primary' : 'default'" @click="filterMark" size="small">
        已标记
        <FlagFilled v-if="isMarkedOnly" />
        <FlagOutlined v-else />
      </a-button>
    </div>
    <div class="render-list" v-if="renderListData.length > 0">
      <div class="render-list-item" v-for="(item, index) in renderListData" :key="index" @click="handleClick(item)">
        <div class="render-list-item-content">
          <p class="render-list-item-content-title">{{ item.title }}</p>
          <p class="render-list-item-content-time">{{ formatTimestamp(item.timestamp) }}</p>
        </div>
        <div class="render-list-item-action">
          <FlagFilled v-if="item.marked" style="color: #d32029;" class="marked" @click.stop="handleMark(item)" />
          <FlagOutlined v-else @click.stop="handleMark(item)" />
        </div>
      </div>
    </div>
    <div style="text-align: center;margin-top: 20px;" v-else>暂无数据</div>
  </div>
</template>

<style lang="less" scoped>
.ctn {
  display: flex;
  flex-direction: column;

  .filter-bar {
    display: flex;
    gap: 8px;
    margin: 12px 0;
  }

  .render-list {
    flex: 1;
    overflow: auto;
    width: 100%;

    .render-list-item {
      height: 50px;
      width: 100%;
      padding: 6px 24px;
      display: flex;
      cursor: pointer;
      transition: all ease-in-out 0.1s;

      &:hover {
        background-color: rgba(255, 255, 255, 0.1);

        .render-list-item-action {
          pointer-events: all;

          >* {
            opacity: 1;
          }
        }
      }

      .render-list-item-content {
        flex: 1;
        font-size: 12px;

        .render-list-item-content-title {
          color: #FFFFFF;
          line-height: 22px;
        }

        .render-list-item-content-time {
          color: #87878b;
          line-height: 16px;
        }
      }

      .render-list-item-action {
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;

        >* {
          transition: opacity 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
          opacity: 0;
        }

        >.marked {
          opacity: 1;
        }
      }
    }
  }
}

.time-sorter-button {
  &:hover {
    .time-sorter-inner .sort-icons .anticon {
      border-color: #1890ff;
    }
  }

  .time-sorter-inner {
    display: flex;
    align-items: center;

    .sort-icons {
      display: inline-flex;
      flex-direction: column;
      gap: 2px;
      margin-left: 4px;

      .anticon {
        display: block;
        width: 10px;
        height: 10px;
        transition: all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
        border-style: solid;
        border-color: rgba(225, 225, 225, 0.85);
        border-width: 0;
        position: relative;

        :deep(svg) {
          position: absolute;
          left: 0;
        }
      }

      .anticon-caret-up,
      .anticon-caret-down {
        font-size: 14px;

        :deep(svg) {
          margin: -2px;
        }
      }

      .anticon-up,
      .anticon-down {
        font-size: 10px;
      }

      .anticon-up,
      .anticon-caret-up {
        border-bottom-width: 1px;

        :deep(svg) {
          bottom: -2px;
        }
      }

      .anticon-down,
      .anticon-caret-down {
        border-top-width: 1px;

        :deep(svg) {
          top: -2px;
        }
      }
    }
  }
}

p {
  margin: 0;
}
</style>
