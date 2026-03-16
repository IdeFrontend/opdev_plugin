<!--
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { computed } from 'vue';
import { t } from 'i18next';
import {
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons-vue';

const emit = defineEmits([
  'addTableItem',
  'deleteTableItem',
  'onChange',
]);

const columns = computed(() => [
  { title: t('web.config.editTable.paramName'), dataIndex: 'name', width: '40%' },
  { title: t('web.config.editTable.paramValue'), dataIndex: 'value', width: '50%' },
  { title: t('web.config.editTable.action'), dataIndex: 'operation', width: '10%' },
]);
const props = defineProps({
  dataSource: {
    type: Array,
    default: () => [],
  },
});

console.log('props', props);

const deleteTableItem = (key) => {
  emit('deleteTableItem', key);
};
const addTableItem = () => {
  emit('addTableItem');
};

const onChange = () => {
  emit('onChange');
};
</script>

<template>
  <div>
    <div class="header-row">
      <div
        class="add-table-item"
        @click="addTableItem"
      >
        <PlusOutlined /> {{ t('web.config.editTable.addParam') }}
      </div>
      <a-tooltip :title="t('web.config.editTable.addParamTooltip')">
        <QuestionCircleOutlined class="help-icon" />
      </a-tooltip>
    </div>
    <a-table
      :columns="columns"
      :data-source="dataSource"
      bordered
      :pagination="false"
      size="small"
    >
      <template #headerCell="{ column }">
        <template v-if="column.dataIndex === 'name'">
          <span>{{ t('web.config.editTable.paramName') }}</span>
          <a-tooltip :title="t('web.config.editTable.paramNameTooltip')">
            <QuestionCircleOutlined
              class="help-icon"
              style="margin-left: 4px"
            />
          </a-tooltip>
        </template>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="['name', 'value'].includes(column.dataIndex)">
          <div>
            <a-input
              v-model:value="record[column.dataIndex]"
              style="margin: -5px 0"
              @change="onChange"
            />
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'operation'">
          <div class="editable-row-operations">
            <DeleteOutlined @click="deleteTableItem(record.key)" />
          </div>
        </template>
      </template>
    </a-table>
  </div>
</template>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.add-table-item {
  color: #4ba5f4;
  cursor: pointer;
}
.editable-row-operations a {
  margin-right: 8px;
  color: #4ba5f4;
  cursor: pointer;
}
</style>
