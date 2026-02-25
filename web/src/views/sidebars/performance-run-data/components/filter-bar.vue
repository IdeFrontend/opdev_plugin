<script setup lang="ts">
import {
  UpOutlined,
  CaretUpFilled,
  DownOutlined,
  CaretDownFilled,
  FlagOutlined,
  FlagFilled,
} from '@ant-design/icons-vue';
import { useTheme } from '@web/composables/use-theme';

// 使用主题管理组合式函数
const { themeConfig, actualTheme } = useTheme();

/** 正序/倒序 */
const sortOrder = defineModel<'asc' | 'desc'>('sortOrder');

/** 只查看标记 */
const isMarkedOnly = defineModel<boolean>('markedOnly');

function handleExecutionTime() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
}

function handleMarked() {
  isMarkedOnly.value = !isMarkedOnly.value;
}

</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="filter-bar">
      <a-button
        class="execute-time-sorter-button"
        type="default"
        @click="handleExecutionTime"
      >
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
      <a-button
        class="execute-time-sorter-button"
        @click="handleMarked"
      >
        已标记 <FlagFilled
          v-if="isMarkedOnly"
          class="flag-outlined-icon"
        /><FlagOutlined
          v-else
          class="flag-outlined-icon"
        />
      </a-button>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.execute-time-sorter-button {
  border-radius: 2px;

  &:hover,
  &:focus,
  &:active {
    background-color: rgba(20, 20, 20, 0.96) !important;
    border-color: rgb(72, 72, 73) !important;
    color: rgba(255, 255, 255, 0.855) !important;
    box-shadow: rgba(255, 255, 255, 0.04) !important;
  }

  .execute-time-sorter-inner {
    display: flex;
    align-items: center;
    border-radius: 2px;

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

  .flag-outlined-icon {
    position: relative;
    bottom: 2px;
  }
}
</style>
