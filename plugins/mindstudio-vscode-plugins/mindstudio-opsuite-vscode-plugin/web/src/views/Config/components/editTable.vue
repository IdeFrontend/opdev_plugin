<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

 <script setup>
import { cloneDeep } from "lodash-es";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons-vue";
import { reactive, ref } from "vue";
const emit = defineEmits(["addTableItem", "deleteTableItem"]);
const columns = [
  {
    title: "参数名称",
    dataIndex: "name",
    width: "40%",
  },
  {
    title: "参数值",
    dataIndex: "value",
    width: "50%",
  },
  {
    title: "操作",
    dataIndex: "operation",
    width: "10%",
  },
];
const props = defineProps({
  dataSource: {
    type: Array,
    default: () => {},
  },
});

const deleteTableItem = (key) => {
  emit("deleteTableItem", key);
};
const addTableItem = () => {
  emit("addTableItem");
};
</script>

<template>
  <div>
    <div>
      <div class="add-table-item" @click="addTableItem">
        <PlusOutlined /> 新增参数
      </div>
    </div>
    <a-table
      :columns="columns"
      :data-source="dataSource"
      bordered
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, text, record }">
        <template v-if="['name', 'value'].includes(column.dataIndex)">
          <div>
            <a-input
              v-model:value="dataSource[record.key][column.dataIndex]"
              style="margin: -5px 0"
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
.add-table-item {
  float: right;
  color: #4ba5f4;
  cursor: pointer;
  margin-bottom: 12px;
}
.editable-row-operations a {
  margin-right: 8px;
  color: #4ba5f4;
  cursor: pointer;
}
</style>