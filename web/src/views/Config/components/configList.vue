<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref } from "vue";
import { PlusOutlined } from "@ant-design/icons-vue";
const activeConfig = ref("");
const props = defineProps({
  configArray: {
    type: Array,
    default: () => [],
  },
});

if (props.configArray.length > 0) {
  activeConfig.value = props.configArray[0];
}

const emit = defineEmits(["updateActiveConfig"]);

const updateActiveConfig = (item) => {
  activeConfig.value = item;
  emit("updateActiveConfig", item);
};
</script>
<template>
  <div class="config-list">
    <div class="config-list-title">运行/调试/调优配置<PlusOutlined /></div>
    <div
      class="config-list-detail"
      v-for="item in props.configArray"
      :key="item.config_name"
      @click="updateActiveConfig(item)"
      :class="[activeConfig.config_name === item.config_name ? 'is-active' : '']"
    >
      {{ item.config_name }}
    </div>
  </div>
</template>


<style lang="less">
.config-list {
  height: 100%;
  font-size: 14px;
  color: #ffffff;
  width: 225px;
  float: left;
  border-right: 1px solid #2b2b2b;
  .config-list-title {
    font-weight: 700;
    line-height: 16px;
    width: 100%;
    display: flex;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-right: 10px;
  }

  .config-list-detail {
    text-align: left;
    float: left;
    font-weight: 400px;
    line-height: 22px;
    width: 100%;
    cursor: pointer;
    height: 22px;
  }

  .is-active {
    background: #37373d;
  }
}
</style>