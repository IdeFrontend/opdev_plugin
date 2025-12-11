<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref } from "vue";

const Actived = ref("build");

const props = defineProps({
  configList: {
    type: Array,
    default: () => [],
  },
  activeConfig: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["updateActiveOption"]);

const updateActiveOption = (item) => {
  Actived.value = item;
  emit("updateActiveOption", item);
};
</script>
<template>
  <div class="options-box">
    <div class="options-title">
      算子工程配置
    </div>
    <div class="options-list">
      <div class="options-list-item" :class="[Actived === 'build' ? 'is-active' : '']"
        @click="updateActiveOption('build')">
        <img src="../../../assets/svg/build.svg" alt="" class="img">
        编译部署
      </div>
      <div class="options-list-item" :class="[Actived === 'sanitizer' ? 'is-active' : '']"
        @click="updateActiveOption('sanitizer')">
        <img src="../../../assets/svg/check.svg" alt="" class="img">
        异常检测
      </div>
      <div class="options-list-item" :class="[Actived === 'opprof' ? 'is-active' : '']"
        @click="updateActiveOption('opprof')">
        <img src="../../../assets/svg/power.svg" alt="" class="img">
        性能调优
      </div>
    </div>
    <div class="block"></div>
  </div>
</template>


<style lang="less">
.options-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.48);
}

.options-title {
  padding: 0 20px;
  font-size: 22px;
  font-weight: bold;
  word-break: break-all;
}

.block {
  width: 172px;
  height: 100%;
}

.options-list {
  font-size: 14px;
  color: #ffffff;
  width: 750px;
  min-width: 750px;
  display: flex;
  padding: 12px 32px;

  .options-list-item {
    border-radius: 4px;
    border: 1px solid #424242;
    display: flex;
    align-items: center;
    padding: 8px;
    font-size: 14px;
    margin-right: 12px;
    cursor: pointer;

    .img {
      margin-right: 4px;
      width: 16px;
      height: 16px;
    }
  }

  .is-active {
    border-color: #1668dc;
  }
}
</style>