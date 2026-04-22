<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import {
  ref, nextTick, watch,
} from 'vue';
import { t } from 'i18next';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import {
  saveConfig as saveConfigAPI, openExternalLink,
} from '@web/apis';
import EditTable from './edit-table.vue';

const props = defineProps({
  simulationData: {
    type: Object,
    required: true,
  },
  updateIndex: {
    type: Number,
    default: 1,
  },
});

const localSimulationData = ref({});

watch(
  () => props.simulationData,
  (val) => {
    localSimulationData.value = { ...val };
  },
  {
    immediate: true,
    deep: true,
  },
);

const emit = defineEmits([
  'addAdvancedParam',
  'deleteAdvancedParam',
  'update:simulationData',
]);

console.log('emit', emit);

const handleSimulationDataChange = () => {
  emit('update:simulationData', localSimulationData.value);
  saveConfig();
};

const saveConfig = async () => {
  const obj = {
    config_id: localSimulationData.value.config_id,
    user_options: { ...localSimulationData.value.user_options },
  };

  await saveConfigAPI({
    type: 'simulate',
    data: [JSON.parse(JSON.stringify(obj))],
  });
};

const activeKey = ref(['1']);
const guide = ref('https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0082.html');

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

const jumpToGuide = () => {
  openExternalLink(guide.value);
};
</script>

<template>
  <div class="simulation-tab">
    <a-form layout="vertical">
      <div
        class="simulate-title"
        style="margin-bottom: 8px"
      >
        {{ t('web.config.simulatorType') }}
        <a-tooltip :title="t('web.config.simulatorTypeTooltip')">
          <QuestionCircleOutlined class="help-icon" />
        </a-tooltip>
      </div>
      <a-form-item>
        <a-input
          v-model:value="localSimulationData.user_options.simulatorType"
          :placeholder="t('web.config.simulatorTypePlaceholder')"
          @change="handleSimulationDataChange"
        />
      </a-form-item>

      <EditTable
        :key="updateIndex"
        class="add-params"
        :data-source="localSimulationData.user_options.advance_param"
        @add-table-item="addTableItem"
        @delete-table-item="deleteTableItem"
        @on-change="handleSimulationDataChange"
      />
    </a-form>
  </div>
</template>

<style lang="less" scoped>
.simulation-tab {
  .simulate-title {
    display: flex;
    align-items: center;

    .help-icon {
      margin-left: 4px;
    }
  }

  .add-params {
    margin-top: 12px;
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
