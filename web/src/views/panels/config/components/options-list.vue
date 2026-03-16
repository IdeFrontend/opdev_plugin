<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, watch, inject, computed,
} from 'vue';
import { t } from 'i18next';

const actualTheme = inject('actualTheme', computed(() => 'dark'));

const Actived = ref('build');

const props = defineProps({
  configList: {
    type: Array,
    default: () => [],
  },
  activeConfig: {
    type: String,
    default: '',
  },
  activeOption: {
    type: String,
    default: 'build',
  },
  supportsSanitizerAndTuning: {
    type: Boolean,
    default: true,
  },
  projectType: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['updateActiveOption']);

watch(
  () => props.activeOption,
  (newVal) => {
    Actived.value = newVal;
  },
  { immediate: true },
);

const updateActiveOption = (item) => {
  Actived.value = item;
  emit('updateActiveOption', item);
};
</script>
<template>
  <div class="options-box">
    <div class="options-list">
      <div
        class="options-list-item"
        :class="[Actived === 'build' ? 'is-active' : '', actualTheme === 'dark' ? 'item-dark' : 'item-light']"
        @click="updateActiveOption('build')"
      >
        <img
          src="../../../../assets/svg/build.svg"
          alt=""
          class="img"
        />
        {{ t('web.config.optionBuild') }}
      </div>
      <div
        v-if="projectType !== 'pyasc'"
        class="options-list-item"
        :class="[Actived === 'sanitizer' ? 'is-active' : '', actualTheme === 'dark' ? 'item-dark' : 'item-light']"
        @click="updateActiveOption('sanitizer')"
      >
        <img
          src="../../../../assets/svg/check.svg"
          alt=""
          class="img"
        />
        {{ t('web.config.optionSanitizer') }}
      </div>
      <div
        v-if="supportsSanitizerAndTuning"
        class="options-list-item"
        :class="[Actived === 'opprof' ? 'is-active' : '', actualTheme === 'dark' ? 'item-dark' : 'item-light']"
        @click="updateActiveOption('opprof')"
      >
        <img
          src="../../../../assets/svg/power.svg"
          alt=""
          class="img"
        />
        {{ t('web.config.optionPerformance') }}
      </div>
      <div
        class="options-list-item"
        :class="[Actived === 'env' ? 'is-active' : '', actualTheme === 'dark' ? 'item-dark' : 'item-light']"
        @click="updateActiveOption('env')"
      >
        <img
          src="../../../../assets/svg/sh.svg"
          alt=""
          class="img"
        />
        {{ t('web.config.optionEnv') }}
      </div>
    </div>
  </div>
</template>

<style lang="less">
.options-box {
  width: 100%;
  height: 100%;
  padding: 12px;
  overflow: hidden;
}

.options-list {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  padding-left: 12px;

  .options-list-item {
    border-radius: 4px;
    border: 1px solid #424242;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 112px;
    color: #ffffff;

    .img {
      margin-right: 4px;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      // 默认深色主题下保持原色
      filter: none;
    }

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  // 深色主题样式
  .item-dark {
    color: #ffffff;
    border-color: #424242;

    .img {
      filter: none;
    }

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  // 浅色主题样式
  .item-light {
    color: #1f1f1f;
    border-color: #d9d9d9;

    .img {
      // 浅色主题下使用滤镜使图标变深
      filter: brightness(0) saturate(100%) invert(20%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
  }

  .is-active {
    border-color: #1668dc;
    background-color: rgba(22, 104, 220, 0.1);
  }
}
</style>
