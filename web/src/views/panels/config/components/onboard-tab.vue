<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, computed, watch, nextTick,
} from 'vue';
import { t } from 'i18next';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import editTable from './edit-table.vue';
import {
  saveConfig as saveConfigAPI, openExternalLink,
} from '@web/apis';

const props = defineProps({
  onboardData: {
    type: Object,
    required: true,
  },
  updateIndex: {
    type: Number,
    default: 1,
  },
});

const localOnboardData = ref({});

watch(
  () => props.onboardData,
  (val) => {
    localOnboardData.value = { ...val };
  },
  {
    immediate: true,
    deep: true,
  },
);

// Advanced collapse panel - default open
const advancedCollapseActiveKey = ref(['1']);

const emit = defineEmits([
  'selectAll',
  'memoryAnalysisChange',
  'operatorPerformanceChange',
  'addAdvancedParam',
  'deleteAdvancedParam',
  'update:onboardData',
]);

const handleOnboardDataChange = () => {
  emit('update:onboardData', localOnboardData.value);
  saveConfig();
};

console.log('handleOnboardDataChange', handleOnboardDataChange);

const addTableItem = () => {
  emit('addAdvancedParam');
  nextTick(() => {
    saveConfig();
  });
};

const deleteTableItem = (e) => {
  console.log('delete event', e);
  emit('deleteAdvancedParam', e);
  nextTick(() => {
    saveConfig();
  });
};

const handleSelectAll = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('selectAll', checked);
  nextTick(() => {
    saveConfig();
  });
};

const handleMemoryAnalysisChange = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('memoryAnalysisChange', checked);
  nextTick(() => {
    saveConfig();
  });
};

const handleOperatorPerformanceChange = (e) => {
  const checked = typeof e === 'boolean' ? e : (e.target?.checked ?? false);

  emit('operatorPerformanceChange', checked);
  nextTick(() => {
    saveConfig();
  });
};

// 所有全选
const totalSelectedAll = ref(true);
// 内存分析图全选
const memorySelectedAll = ref(true);
// 算子性能数据文件全选
const performanceSelectedAll = ref(true);

// 内存分析图，这组半选
const memorySelectedHalf = computed(() => {
  if (
    localOnboardData.value.user_options?.Occupancy
    && localOnboardData.value.user_options?.Roofline
  ) {
    return false;
  }

  return true;
});

// 算子性能数据文件，这组半选
const performanceSelectedHalf = computed(() => {
  let count = 0;
  const keyArray = [
    'ArithmeticUtilization',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'PipeUtilization',
    'ResourceConflictRatio',
  ];

  keyArray.forEach((key) => {
    if (localOnboardData.value.user_options?.[key]) {
      count += 1;
    }
  });

  return count > 0 && count < keyArray.length;
});

// 所有图形半选状态
const totalSelectedHalf = computed(() => {
  let count = 0;
  const totalKeys = [
    'Occupancy',
    'Roofline',
    'Source',
    'MemoryDetail',
    'ArithmeticUtilization',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'PipeUtilization',
    'ResourceConflictRatio',
  ];

  totalKeys.forEach((key) => {
    if (localOnboardData.value.user_options?.[key]) {
      count += 1;
    }
  });

  return count < totalKeys.length;
});

const saveConfig = async () => {
  const obj = {
    config_id: localOnboardData.value.config_id,
    user_options: { ...localOnboardData.value.user_options },
  };

  await saveConfigAPI({
    type: 'on_board',
    data: [JSON.parse(JSON.stringify(obj))],
  });
};

// 组内选项全部选中时，自动选上“全选”
watch(
  () => localOnboardData.value.user_options,
  () => {
    if (!localOnboardData.value.user_options) {
      return;
    }

    memorySelectedAll.value =
      localOnboardData.value.user_options.Occupancy
      && localOnboardData.value.user_options.Roofline;

    let count = 0;
    const keyArray = [
      'ArithmeticUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
      'MemoryUB',
      'PipeUtilization',
      'ResourceConflictRatio',
    ];

    keyArray.forEach((key) => {
      if (localOnboardData.value.user_options[key]) {
        count += 1;
      }
    });
    performanceSelectedAll.value = count === keyArray.length;

    totalSelectedAll.value =
      memorySelectedAll.value
      && performanceSelectedAll.value
      && localOnboardData.value.user_options.Source
      && localOnboardData.value.user_options.MemoryDetail;
  },
  {
    deep: true,
    immediate: true,
  },
);

const startHref =
  'https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1214.html';
const stopHref =
  'https://www.hiascend.com/document/detail/zh/canncommercial/83RC1/API/ascendcopapi/atlasascendc_api_07_1215.html';
const guide =
  'https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html';

const jumpToGuide = (url) => {
  openExternalLink(url);
};
</script>

<template>
  <div class="onboard-tab">
    <a-form layout="vertical">
      <a-form-item>
        <a-checkbox
          v-model:checked="onboardData.user_options.KernelScale"
          @change="saveConfig"
        >
          {{ t('web.config.onboard.enableKernelProf') }}
          <a-tooltip>
            <QuestionCircleOutlined class="help-icon" />
            <template #title>
              <div>
                {{ t('web.config.onboard.kernelProfHint') }}
                <span
                  style="color: #1677ff; cursor: pointer;"
                  @click="jumpToGuide(startHref)"
                >MetricsProfStart</span>
                {{ t('web.config.onboard.and') }}
                <span
                  style="color: #1677ff; cursor: pointer;"
                  @click="jumpToGuide(stopHref)"
                >MetricsProfStop</span>
                {{ t('web.config.onboard.api') }}
              </div>
            </template>
          </a-tooltip>
        </a-checkbox>
      </a-form-item>
      <a-alert
        v-if="onboardData.user_options.KernelScale"
        type="info"
        show-icon
        style="margin-bottom: 12px;"
      >
        <template #message>
          {{ t('web.config.onboard.confirmKernelProf') }}
          <span
            style="color: #1677ff; cursor: pointer;"
            @click="jumpToGuide(startHref)"
          >MetricsProfStart</span>
          {{ t('web.config.onboard.and') }}
          <span
            style="color: #1677ff; cursor: pointer;"
            @click="jumpToGuide(stopHref)"
          >MetricsProfStop</span>
          {{ t('web.config.onboard.api') }}
        </template>
      </a-alert>

      <a-form-item>
        <editTable
          :key="updateIndex"
          :data-source="onboardData.user_options.advance_param"
          @add-table-item="addTableItem"
          @delete-table-item="deleteTableItem"
          @on-change="saveConfig"
        />
      </a-form-item>
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.onboard-tab {
  .flex-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
    }
  }

  :deep(.ant-form-item) {
    margin-bottom: 0;
  }

  :deep(.ant-collapse-header) {
    padding-left: 0;
    padding-right: 0;
  }

  :deep(.ant-collapse-content-box) {
    padding: 0;
    padding-block: unset !important;
  }
}
</style>
