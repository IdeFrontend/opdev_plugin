<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { cloneDeep } from 'lodash-es';
import {
  PlusOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons-vue';
import { reactive, ref } from 'vue';

const emit = defineEmits(['addTableItem', 'deleteTableItem', 'onChange']);
const columns = [
  {
    title: '参数名称',
    dataIndex: 'name',
    width: '40%',
  },
  {
    title: '参数值',
    dataIndex: 'value',
    width: '50%',
  },
  {
    title: '操作',
    dataIndex: 'operation',
    width: '10%',
  },
];
const props = defineProps({
  dataSource: {
    type: Array,
    default: () => {},
  },
});

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
        <PlusOutlined /> 新增参数
      </div>
      <a-tooltip
        title="这里添加的参数，参数会追加到命令行，具体参数可在终端窗口中执行 msprof op -h 获取具体参数信息，基础配置中已设置了 aic-metrics 参数"
      >
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
          <span>参数名称</span>
          <a-tooltip title="参数名称默认自带--前缀，无需手动添加">
            <QuestionCircleOutlined
              class="help-icon"
              style="margin-left: 4px"
            />
          </a-tooltip>
        </template>
      </template>
      <template #bodyCell="{ column, text, record }">
        <template v-if="['name', 'value'].includes(column.dataIndex)">
          <div>
            <a-input
              v-model:value="dataSource[record.key][column.dataIndex]"
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
