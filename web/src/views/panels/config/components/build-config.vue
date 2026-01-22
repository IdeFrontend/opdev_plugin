<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->
<script setup>
import {
  ref, watch,
} from 'vue';
import { saveBuildConfig as saveBuildConfigAPI } from '@web/apis';

const props = defineProps({
  buidlConfigData: {
    type: String,
    default: '',
  },
  buildConfigForme: {
    type: Object,
    default: () => ({}),
  },
  exampleConfigForme: {
    type: Object,
    default: () => ({}),
  },
  exampleConfigId: {
    type: String,
    default: '',
  },
  buildConfigId: {
    type: String,
    default: '',
  },
  activeConfig: {
    type: String,
    default: '',
  },
  isStandardCustom: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits([
  'addBuildTableItem',
  'deleteBuildTableItem',
  'addExampleTableItem',
  'deleteExampleTableItem',
  'update:buildConfigForme',
  'update:exampleConfigForme',
]);

const localBuildConfigForme = ref({});
const localExampleConfigForme = ref({});

watch(
  () => props.buildConfigForme,
  (val) => {
    localBuildConfigForme.value = { ...val };
  },
  {
    immediate: true,
    deep: true,
  },
);

watch(
  () => props.exampleConfigForme,
  (val) => {
    localExampleConfigForme.value = { ...val };
    // 如果是标准自定义算子且没有执行模式，初始化为 eager
    if (props.isStandardCustom && !localExampleConfigForme.value.execution_mode) {
      localExampleConfigForme.value.execution_mode = 'eager';
    }
  },
  {
    immediate: true,
    deep: true,
  },
);

const handleBuildConfigChange = () => {
  emit('update:buildConfigForme', localBuildConfigForme.value);
  saveBuildConfig();
};

const handleExampleConfigChange = () => {
  emit('update:exampleConfigForme', localExampleConfigForme.value);
  saveBuildConfig();
};

const saveBuildConfig = async () => {
  const data = getSaveData();

  console.log(data);
  await saveBuildConfigAPI({ data });
};

const getSaveData = () => {
  const data = [
    {
      config_id: props.buildConfigId,
      config_type: 'build_op',
      user_options: localBuildConfigForme.value,
    },
    {
      config_id: props.exampleConfigId,
      config_type: 'build_example',
      user_options: localExampleConfigForme.value,
    },
  ];

  return JSON.parse(JSON.stringify(data));
};
</script>

<template>
  <div class="build-config">
    <div class="model-title">
      算子编译配置
    </div>
    <a-form
      ref="connectionFormRef"
      :model="localBuildConfigForme"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      layout="vertical"
    >
      <a-form-item
        label="要编译的算子名称"
        name="op"
      >
        <a-input
          v-model:value="localBuildConfigForme.op"
          placeholder="请输入算子名称"
          @change="handleBuildConfigChange"
        />
      </a-form-item>

      <a-form-item
        v-if="false"
        label="编译生成文件位置"
        name="target_dir"
      >
        <a-input
          v-model:value="localBuildConfigForme.target_dir"
          placeholder="请输入生成文件位置"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        :label="isStandardCustom ? '算子部署命令' : '算子运行验证命令行'"
        name="ipAddress"
      >
        <a-input
          v-model:value="localBuildConfigForme.target_file"
          :placeholder="isStandardCustom ? '请输入算子部署命令' : '请输入算子运行验证命令行'"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        label="编译命令行"
        name="script"
      >
        <a-input
          v-model:value="localBuildConfigForme.script"
          placeholder="请输入编译命令行"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
    </a-form>
    <div
      v-if="isStandardCustom"
      class="model-title"
    >
      example编译配置
    </div>
    <a-form
      v-if="isStandardCustom"
      ref="exampleFormRef"
      :model="localExampleConfigForme"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      layout="vertical"
    >
      <a-form-item
        label="执行模式"
        name="execution_mode"
      >
        <a-radio-group
          v-model:value="localExampleConfigForme.execution_mode"
          @change="handleExampleConfigChange"
        >
          <a-radio value="eager">
            eager（aclnn调用）
          </a-radio>
          <a-radio value="graph">
            graph（图模式调用）
          </a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item
        label="算子运行验证命令行"
        name="script"
      >
        <a-input
          v-model:value="localExampleConfigForme.script"
          placeholder="请输入算子运行验证命令行"
          @change="handleExampleConfigChange"
        />
      </a-form-item>
    </a-form>
  </div>
</template>

<style lang="less">
.build-config {
  .title {
    font-weight: 700;
    font-size: 18px;
    margin-bottom: 24px;
  }
  .model-title {
    font-weight: 700;
    font-size: 16px;
    margin-bottom: 16px;
  }
  .ant-form-item {
    margin-bottom: 16px;
  }

  .ant-collapse-item {
    padding-bottom: 24px !important;
  }

  .ant-collapse-header {
    padding: 0 16px 0 0 !important;
  }
}
</style>
