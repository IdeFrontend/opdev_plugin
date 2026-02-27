<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->
<script setup>
import {
  ref,
  watch, 
  onBeforeMount, 
  computed
} from 'vue';
import {
  saveBuildConfig as saveBuildConfigAPI,
  getSanitizerConfigs, 
  saveSanitizerForm, 
  saveConfig,
  getConfigData, 
  getProjectType,
  getDebugMode,
  checkMultipleOperators
} from '@web/apis';

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

const sanitizerScript = ref('')

const handSanitizerConfigChange = () => {
  saveSanitizerForm({ data: { script: sanitizerScript.value } });
};

onBeforeMount(async () => {
  // 查询各个编译脚本配置
  const configs = await getSanitizerConfigs();
  console.log('[build-config] 查询异常检测配置', configs)
  const obj = (configs[0] || {})?.user_options || {};
  sanitizerScript.value = obj.script || '';

  fetchOnBoardConfig()
  fetchSimulateConfig()

  // 获取当前项目类型
  try {
    const result = await getProjectType();
    projectType.value = result.projectType || '';
    projectTemplateName.value = result.projectTemplateName || '';
    console.log('[build-config] 当前项目类型:', JSON.stringify(result));
  }
  catch (error) {
    console.error('[build-config] 获取项目类型失败:', error);
  }

  // 获取调试模式开关状态
  try {
    debugModeEnabled.value = await getDebugMode();
    console.log('[build-config] 调试模式状态:', debugModeEnabled.value);
  }
  catch (error) {
    console.error('[build-config] 获取调试模式状态失败:', error);
    debugModeEnabled.value = true; // 默认开启
  }

  // 检查标准自定义算子是否支持性能调优
  try {
    const result = await checkMultipleOperators();
    supportsSanitizerAndTuning.value = result.supportsSanitizerAndTuning ?? true;
    console.log('[build-config] 是否支持异常检测与调优:', supportsSanitizerAndTuning.value);
  }
  catch (error) {
    supportsSanitizerAndTuning.value = true;
  }
});

const simulateOptions = ref({ user_options: { script: true } });
const fetchSimulateConfig = async () => {
  try {
    const configObj = await getConfigData();
    const keys = Object.keys(configObj || {})
    const configData = configObj[keys[0]] || []
    const simulateConfig = configData.find(v => v.config_type === 'simulate')
    if (simulateConfig) {
      simulateOptions.value = JSON.parse(JSON.stringify(simulateConfig));
    }
  }
  catch (error) {
    console.error('[fetchSimulateConfig]获取仿真配置失败: ', error);
  }
};
const handleSimulateScriptChange = async () => {
  await saveConfig({
    type: 'simulate',
    data: [simulateOptions.value],
  });
};

const onboardData = ref({ user_options: { script: true } });
const fetchOnBoardConfig = async () => {
  try {
    const configObj = await getConfigData();
    const keys = Object.keys(configObj || {})
    const configData = configObj[keys[0]] || []
    const onBoardConfig = configData.find(v => v.config_type === 'on_board')
    if (onBoardConfig) {
      onboardData.value = JSON.parse(JSON.stringify(onBoardConfig));
    }
  }
  catch (error) {
    console.error('[fetchOnBoardConfig]获取上板配置失败: ', error);
  }
};
const handleOnBoardScriptChange = async () => {
  await saveConfig({
    type: 'on_board',
    data: [onboardData.value],
  });
};

const supportsSanitizerAndTuning = ref(true)
const debugModeEnabled = ref(false)
const projectType = ref('');  // 项目类型  'cann' | 'ascend' | 'pyasc'
const projectTemplateName = ref(''); // 项目子类型  'hello_world' | 'addn_custom' | 'torch_library_template'
const showCpuDebugScript = computed(() => {
  if (projectType.value === 'pyasc') {
    return false
  }
  const isCannTorchLibrary = projectType.value === 'cann' && projectTemplateName.value === 'torch_library_template';
  if (projectType.value !== 'ascend' && !isCannTorchLibrary) {
    return true
  }
  return false
})
const showNpuDebugScript = computed(() => {
  if (projectType.value === 'pyasc') {
    return false
  }
  if (projectType.value === 'ascend') {
    return debugModeEnabled.value && supportsSanitizerAndTuning.value
  }
  return debugModeEnabled.value
})
const showPowerScript = computed(() => {
  if (projectType.value === 'pyasc') {
    return false
  }
  if (projectType.value === 'cann') {
    return true
  }
  return projectType.value === 'ascend' && supportsSanitizerAndTuning.value
})
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
        v-if="projectType !== 'pyasc'"
        :label="isStandardCustom ? '算子部署命令' : '算子运行命令行'"
        name="ipAddress"
      >
        <a-input
          v-model:value="localBuildConfigForme.target_file"
          :placeholder="isStandardCustom ? '请输入算子部署命令' : '请输入算子运行命令行'"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        v-if="projectType !== 'pyasc'"
        label="编译命令行"
        name="script"
      >
        <a-input
          v-model:value="localBuildConfigForme.script"
          placeholder="请输入编译命令行"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        v-if="showCpuDebugScript"
        label="CPU调试编译命令行"
        name="cpu_debug_script"
      >
        <a-input
          v-model:value="localBuildConfigForme.cpu_debug_script"
          placeholder="请输入CPU调试编译命令行"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        v-if="showNpuDebugScript"
        label="NPU调试编译命令行"
        name="npu_debug_script"
      >
        <a-input
          v-model:value="localBuildConfigForme.npu_debug_script"
          placeholder="请输入NPU调试编译命令行"
          @change="handleBuildConfigChange"
        />
      </a-form-item>
      <a-form-item
        v-if="projectType !== 'pyasc'"      
        label="异常检测编译命令行"
        name="sanitizerScript"
      >
        <a-input
          v-model:value="sanitizerScript"
          placeholder="请输入异常检测编译命令行"
          @change="handSanitizerConfigChange"
        />
      </a-form-item>
      <a-form-item
        v-if="showPowerScript"
        label="上板分析编译命令行"
        name="onBoardScript"
      >
        <a-input
          v-model:value="onboardData.user_options.script"
          placeholder="请输入上板分析编译命令行"
          @change="handleOnBoardScriptChange"
        />
      </a-form-item>
      <a-form-item
        v-if="showPowerScript"
        label="仿真分析编译命令行"
        name="simulateScript"
      >
        <a-input
          v-model:value="simulateOptions.user_options.script"
          placeholder="请输入仿真分析编译命令行"
          @change="handleSimulateScriptChange"
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
        label="算子运行命令行"
        name="script"
        tooltip="执行该命令时，会自动在后面拼接算子名称、执行模式和和包模式"
      >
        <a-input
          v-model:value="localExampleConfigForme.script"
          placeholder="请输入算子运行命令行"
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
