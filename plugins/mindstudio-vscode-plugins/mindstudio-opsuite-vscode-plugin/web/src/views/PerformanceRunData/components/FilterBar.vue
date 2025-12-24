<script setup lang="ts">
import { UpOutlined, CaretUpFilled, DownOutlined, CaretDownFilled, FlagOutlined, FlagFilled, ReloadOutlined } from '@ant-design/icons-vue';
import { h } from 'vue';

/** 正序/倒序 */
const sortOrder = defineModel<'asc' | 'desc'>('sortOrder');

/** 只查看标记 */
const isMarkedOnly = defineModel<boolean>('markedOnly');

const emit = defineEmits<{
  (e: 'reload'): void;
}>();

function handleExecutionTime() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
}

function handleMarked() {
  isMarkedOnly.value = !isMarkedOnly.value;
}

function handleReload() {
  emit('reload');
}
</script>

<template>
  <div class="filter-bar">
    <a-button class="execute-time-sorter-button" type="default" @click="handleExecutionTime" size="small">
      <div class="execute-time-sorter-inner">
        执行时间
        <div class="sort-icons">
          <CaretUpFilled v-if="sortOrder === 'asc'" />
          <UpOutlined v-else />
          <CaretDownFilled v-if="sortOrder === 'desc'" />
          <DownOutlined v-else />
        </div>
      </div>
    </a-button>
    <a-button :type="isMarkedOnly ? 'primary' : 'default'" @click="handleMarked" size="small">
      已标记 <FlagFilled v-if="isMarkedOnly" /><FlagOutlined v-else />
    </a-button>
    <a-button type="text" :icon="h(ReloadOutlined)" title="刷新" size="small" @click="handleReload"></a-button>
  </div>
</template>

<style lang="less" scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.execute-time-sorter-button {
  &:hover {
    .execute-time-sorter-inner .sort-icons .anticon {
      border-color: #1890ff;
    }
  }

  .execute-time-sorter-inner {
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
</style>
