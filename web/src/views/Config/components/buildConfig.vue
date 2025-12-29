<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->
<script setup>
import { ref, nextTick } from "vue";
import editTable from "./editTable.vue";
import { message } from "../../../untils/Message.ts";
import { DownOutlined } from "@ant-design/icons-vue";
const props = defineProps({
  buidlConfigData: {
    type: String,
    default: "",
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
    default: "",
  },
  buildConfigId: {
    type: String,
    default: "",
  },
  activeConfig: {
    type: String,
    default: "",
  },
});
const emit = defineEmits([
  "addBuildTableItem",
  "deleteBuildTableItem",
  "addExampleTableItem",
  "deleteExampleTableItem",
]);
const activeKey1 = ref(["1"]);
const activeKey2 = ref(["1"]);
const activeKey3 = ref(["1"]);
const updateIndex = ref(1);

const addBuildTableItem = () => {
  updateIndex.value++;
  emit("addBuildTableItem");
  nextTick(() => {
    saveBuildConfig()
  })
};
const deleteBuildTableItem = (key) => {
  updateIndex.value++;
  emit("deleteBuildTableItem", key);
  nextTick(() => {
    saveBuildConfig()
  })
};
const addExampleTableItem = () => {
  updateIndex.value++;
  emit("addExampleTableItem");
};
const deleteExampleTableItem = (key) => {
  updateIndex.value++;
  emit("deleteExampleTableItem", key);
};

const saveBuildConfig = () => {
  const data = getSaveData();
  console.log(data);
  message.sendMessageToParent({ command: "vscodeSaveBuildConfig", data });
};
const saveAndStartBuild = () => {
  const data = getSaveData();
  message.sendMessageToParent({ command: "vscodeSaveAndStartBuild", data });
};
const saveAndStartBuildExample = () => {
  const data = getSaveData();
  message.sendMessageToParent({
    command: "vscodeSaveAndStartBuildExample",
    data,
  });
};
const getSaveData = () => {
  const data = [
    {
      config_id: props.buildConfigId,
      config_type: "build_op",
      user_options: props.buildConfigForme,
    },
    {
      config_id: props.exampleConfigId,
      config_type: "build_example",
      user_options: props.exampleConfigForme,
    },
  ];
  return JSON.parse(JSON.stringify(data));
};
</script>

<template>
  <div class="build-config">
    <div class="model-title">算子编译配置</div>
    <a-form
      :model="buildConfigForme"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      ref="connectionFormRef"
      layout="vertical"
    >
      <a-form-item label="要编译的算子名称" name="op">
        <a-input
          v-model:value="buildConfigForme.op"
          placeholder="请输入算子名称"
          @change="saveBuildConfig"
        />
      </a-form-item>

      <a-form-item v-if="false" label="编译生成文件位置" name="target_dir">
        <a-input
          v-model:value="buildConfigForme.target_dir"
          placeholder="请输入生成文件位置"
          @change="saveBuildConfig"
        />
      </a-form-item>
      <a-form-item label="编译生成文件名称" name="ipAddress">
        <a-input
          v-model:value="buildConfigForme.target_file"
          placeholder="请输入生成文件名称"
          @change="saveBuildConfig"
        />
      </a-form-item>
      <a-form-item label="编译命令行" name="script">
        <a-input v-model:value="buildConfigForme.script" placeholder="" @change="saveBuildConfig" />
      </a-form-item>
    </a-form>
    <a-collapse v-model:activeKey="activeKey1" ghost>
      <a-collapse-panel key="1" header="高级配置">
        <a-form
          :model="buildConfigForme"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          ref="connectionFormRef"
          layout="vertical"
        >
          <a-form-item label="高级参数">
            <editTable
              :key="updateIndex"
              :dataSource="buildConfigForme.advance_param"
              @addTableItem="addBuildTableItem"
              @deleteTableItem="deleteBuildTableItem"
              @onChange="saveBuildConfig"
            />
          </a-form-item>
        </a-form>
      </a-collapse-panel>
    </a-collapse>
    <!-- <div class="model-title">example编译配置</div>
    <a-form
      :model="exampleConfigForme"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 24 }"
      layout="vertical"
    >
      <a-form-item label="执行模式" name="mode">
        <a-radio-group v-model:value="exampleConfigForme.mode">
          <a-radio :style="radioStyle" value="eager">eager(aclnn调用)</a-radio>
          <a-radio :style="radioStyle" value="graph"
            >graph(图模式调用)</a-radio
          >
        </a-radio-group>
      </a-form-item>

      <a-form-item v-if="false" label="编译example生成文件位置" name="target_dir">
        <a-input v-model:value="exampleConfigForme.target_dir" />
      </a-form-item>

      <a-form-item label="编译example生成文件名称" name="target_file">
        <a-input
          v-model:value="exampleConfigForme.target_file"
          placeholder=""
        />
      </a-form-item>

      <a-form-item label="编译命令行" name="script">
        <a-input v-model:value="exampleConfigForme.script" />
      </a-form-item>
    </a-form>

    <a-collapse v-model:activeKey="activeKey2" ghost>
      <a-collapse-panel key="1" header="高级配置">
        <a-form
          :model="exampleConfigForme"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          ref="connectionFormRef"
          :rules="connectionFormRules"
          layout="vertical"
        >

          <a-form-item label="高级参数" name="userName">
            <editTable
              :key="updateIndex"
              :dataSource="exampleConfigForme.advance_param"
              @addTableItem="addExampleTableItem"
              @deleteTableItem="deleteExampleTableItem"
            />
          </a-form-item>
        </a-form>
      </a-collapse-panel>
    </a-collapse>

    <a-collapse v-model:activeKey="activeKey3" ghost>
      <a-collapse-panel key="1" header="高级配置">
        <a-form
          :model="buildConfigForme"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          ref="connectionFormRef"
          :rules="connectionFormRules"
          layout="vertical"
        >
          <a-form-item label="SOC" name="soc">
            <a-input v-model:value="buildConfigForme.soc" placeholder="" />
          </a-form-item>

          <a-form-item label="vendor_name" name="vendor_name">
            <a-input
              v-model:value="buildConfigForme.vendor_name"
              placeholder=""
            />
          </a-form-item>
        </a-form>
      </a-collapse-panel>
    </a-collapse> -->
    <!-- <a-button @click="saveBuildConfig"> 保存 </a-button> -->
    <!-- <a-button  @click="saveAndStartBuild" style="margin-left: 15px" type="primary">保存并开始</a-button> -->
    <!-- <a-button @click="saveAndStartBuild"> 保存并开始 </a-button> -->
    <!--  <a-dropdown>
      <template #overlay>
        <a-menu @click="handleMenuClick">
          <a-menu-item @click="saveAndStartBuild" key="1"
            >编译部署算子</a-menu-item
          >
          <a-menu-item @click="saveAndStartBuildExample" key="2"
            >编译example</a-menu-item
          >
        </a-menu>
      </template>
      <a-button  @click="saveAndStartBuild" style="margin-left: 15px" type="primary">
        保存并开始
        <DownOutlined />
      </a-button>
    </a-dropdown> -->
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