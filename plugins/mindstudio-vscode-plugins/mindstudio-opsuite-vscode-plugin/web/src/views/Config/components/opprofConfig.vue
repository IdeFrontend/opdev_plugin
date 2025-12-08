<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->
 
<script setup>
const props = defineProps({
  activeConfig: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <div>{{ props.activeConfig.name }} opprof</div>
</template>

<style lang="less">
</style>