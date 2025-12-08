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
});

const emit = defineEmits(["updateActiveOption"]);

const updateActiveOption = (item) => {
  Actived.value = item;
  emit("updateActiveOption", item);
};
</script>
<template>
  <div class="options-list">
    <div
      class="options-list-build options-list-title"
      :class="[Actived === 'build' ? 'is-active' : '']"
      @click="updateActiveOption('build')"
    >
      算子/example编译
    </div>
    <div
      class="options-list-sanitizer options-list-title"
      @click="updateActiveOption('sanitizer')"
      :class="[Actived === 'sanitizer' ? 'is-active' : '']"
    >
      异常检测
    </div>
    <div
      class="options-list-opprof options-list-title"
      @click="updateActiveOption('opprof')"
      :class="[Actived === 'opprof' ? 'is-active' : '']"
    >
      性能调优
    </div>
  </div>
</template>


<style lang="less">
.options-list {
  height: 100%;
  font-size: 14px;
  color: #ffffff;
  width: 225px;
  float: left;
  border-right: 1px solid #2b2b2b;
  padding-left: 22px;

  .options-list-title {
    text-align: left;
    float: left;
    font-weight: 400;
    line-height: 16px;
    width: 100%;
    margin-bottom: 24px;
    cursor: pointer;
  }

  .is-active {
    font-weight: 700;
  }
}
</style>