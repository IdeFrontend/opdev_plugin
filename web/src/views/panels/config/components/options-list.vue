<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, watch,
} from 'vue';

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
        :class="[Actived === 'build' ? 'is-active' : '']"
        @click="updateActiveOption('build')"
      >
        <img
          src="../../../../assets/svg/build.svg"
          alt=""
          class="img"
        />
        编译部署
      </div>
      <div
        v-if="supportsSanitizerAndTuning"
        class="options-list-item"
        :class="[Actived === 'sanitizer' ? 'is-active' : '']"
        @click="updateActiveOption('sanitizer')"
      >
        <img
          src="../../../../assets/svg/check.svg"
          alt=""
          class="img"
        />
        异常检测
      </div>
      <div
        v-if="supportsSanitizerAndTuning"
        class="options-list-item"
        :class="[Actived === 'opprof' ? 'is-active' : '']"
        @click="updateActiveOption('opprof')"
      >
        <img
          src="../../../../assets/svg/power.svg"
          alt=""
          class="img"
        />
        性能调优
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
  color: #ffffff;
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

    .img {
      margin-right: 4px;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  .is-active {
    border-color: #1668dc;
    background-color: rgba(22, 104, 220, 0.1);
  }
}
</style>
