<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import buildConfig from './build-config.vue';
import sanitizerConfig from './sanitizer-config.vue';
import opprofConfig from './opprof-config.vue';

import {
  ref, watch, nextTick, onMounted,
} from 'vue';
import { checkMultipleOperators } from '@web/apis';

const props = defineProps({
  activeOption: {
    type: String,
    default: 'build',
  },
  activeConfig: {
    type: String,
    default: '',
  },
  projectType: {
    type: String,
    default: '',
  },
});

const buildConfigForme = ref({});
const exampleConfigForme = ref({});
const buildConfigId = ref('');
const exampleConfigId = ref('');

const simulateConfigData = ref({});
const onBoardConfigData = ref({});
const isStandardCustom = ref(false);

const init = (obj) => {
  const ConfigData = obj;

  console.log(
    '配置数据',
    ConfigData,
    props.activeConfig,
    ConfigData[props.activeConfig],
  );

  // 编译算子表单数据
  const buildConfigData = ConfigData[props.activeConfig].find((v) => v.config_type === 'build_op');

  buildConfigForme.value = buildConfigData.user_options;
  buildConfigId.value = buildConfigData.config_id;

  if (!buildConfigForme.value.advance_param) {
    buildConfigForme.value.advance_param = [];
  }

  buildConfigForme.value.advance_param =
    buildConfigForme.value.advance_param.map((v, i) => {
      v.key = i;

      return v;
    });

  // 编译example表单数据
  const exampleConfigData = ConfigData[props.activeConfig].find((v) => v.config_type === 'build_example');

  exampleConfigForme.value = exampleConfigData.user_options;
  exampleConfigId.value = exampleConfigData.config_id;

  if (!exampleConfigForme.value.advance_param) {
    exampleConfigForme.value.advance_param = [];
  }

  exampleConfigForme.value.advance_param =
    exampleConfigForme.value.advance_param.map((v, i) => {
      v.key = i;

      return v;
    });

  // 仿真表单数据
  simulateConfigData.value = ConfigData[props.activeConfig].find((v) => v.config_type === 'simulate');

  // 上板表单参数
  onBoardConfigData.value = ConfigData[props.activeConfig].find((v) => v.config_type === 'on_board');
};

const addBuildTableItem = () => {
  buildConfigForme.value.advance_param.push({
    name: '',
    value: '',
    key: buildConfigForme.value.advance_param.length,
  });
};
const deleteBuildTableItem = (key) => {
  buildConfigForme.value.advance_param.splice(key, 1);
  buildConfigForme.value.advance_param.forEach((v, i) => {
    console.log('i=', i);
    v.key = i;
  });
};
const addExampleTableItem = () => {
  exampleConfigForme.value.advance_param.push({
    name: '',
    value: '',
    key: exampleConfigForme.value.advance_param.length,
  });
};
const deleteExampleTableItem = (key) => {
  console.log('deleteExampleTableItem');
  exampleConfigForme.value.advance_param.splice(key, 1);
  exampleConfigForme.value.advance_param.forEach((v, i) => (v.key = i));
  console.log(exampleConfigForme.value.advance_param);
};

// 获取是否是标准自定义算子
const checkStandardCustom = async () => {
  try {
    const result = await checkMultipleOperators();
    isStandardCustom.value = result.isStandardCustom || false;
    console.log('[config-detail] isStandardCustom:', isStandardCustom.value);
  } catch (error) {
    console.error('[config-detail] 获取标准自定义算子状态失败:', error);
    isStandardCustom.value = false;
  }
};

defineExpose({ init });

const opprofRef = ref(null);
const opprofInited = ref(false);

// 组件挂载时检查是否是标准自定义算子
onMounted(() => {
  checkStandardCustom();
});

watch(
  () => props.activeOption,
  (val) => {
    if (opprofInited.value) {
      return;
    }

    // 避免使用旧的数据初始化
    if (val === 'opprof') {
      nextTick(() => {
        opprofRef.value.init(simulateConfigData.value, onBoardConfigData.value);
      });
      opprofInited.value = true;
    }
  },
);
</script>
<template>
  <div class="config-detial">
    <buildConfig
      v-if="props.activeOption === 'build'"
      v-model:build-config-forme="buildConfigForme"
      v-model:example-config-forme="exampleConfigForme"
      :example-config-id="exampleConfigId"
      :build-config-id="buildConfigId"
      :active-config="activeConfig"
      :is-standard-custom="isStandardCustom"
      :project-type="projectType"
      @add-build-table-item="addBuildTableItem"
      @delete-build-table-item="deleteBuildTableItem"
      @add-example-table-item="addExampleTableItem"
      @delete-example-table-item="deleteExampleTableItem"
    />
    <sanitizerConfig v-if="props.activeOption === 'sanitizer'" />
    <opprofConfig
      v-if="props.activeOption === 'opprof'"
      ref="opprofRef"
    />
  </div>
</template>

<style lang="less">
.config-detial {
  width: 100%;
  max-width: 1000px;
  overflow-y: auto;
  height: 100%;
  color: #ffffff;
  text-align: left;
  font-size: 14px;
  padding: 20px 32px;
  box-sizing: border-box;
}
</style>
