<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

 <script setup>
import buildConfig from "./buildConfig.vue";
import sanitizerConfig from "./sanitizerConfig.vue";
import opprofConfig from "./opprofConfig.vue";
import { ref } from "vue";
const props = defineProps({
  activeOption: {
    type: String,
    default: "build",
  },
  activeConfig: {
    type: String,
    default: "",
  },
});

const buildConfigForme = ref({});
const exampleConfigForme = ref({});
const buildConfigId = ref("");
const exampleConfigId = ref("");

const init = () => {
  const ConfigData = JSON.parse(localStorage.getItem("buildConfig"));
  console.log(ConfigData, props.activeConfig, ConfigData[props.activeConfig]);

  const buildConfigData = ConfigData[props.activeConfig].find(
    (v) => v.config_type === "build_op"
  );
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

  const exampleConfigData = ConfigData[props.activeConfig].find(
    (v) => v.config_type === "build_example"
  );
  exampleConfigForme.value = exampleConfigData.user_options;
  exampleConfigId.value = exampleConfigData.config_id;

  console.log(exampleConfigForme.value);

  if (!exampleConfigForme.value.advance_param) {
    exampleConfigForme.value.advance_param = [];
  }
  exampleConfigForme.value.advance_param =
    exampleConfigForme.value.advance_param.map((v, i) => {
      v.key = i;
      return v;
    });
};

const addBuildTableItem = () => {
  buildConfigForme.value.advance_param.push({
    name: "",
    value: "",
    key: buildConfigForme.value.advance_param.length,
  });
};
const deleteBuildTableItem = (key) => {
  buildConfigForme.value.advance_param.splice(key, 1);
  buildConfigForme.value.advance_param.forEach((v, i) => {
    console.log("i=", i);
    v.key = i;
  });
};
const addExampleTableItem = () => {
  exampleConfigForme.value.advance_param.push({
    name: "",
    value: "",
    key: exampleConfigForme.value.advance_param.length,
  });
};
const deleteExampleTableItem = (key) => {
  console.log("deleteExampleTableItem");
  exampleConfigForme.value.advance_param.splice(key, 1);
  exampleConfigForme.value.advance_param.forEach((v, i) => (v.key = i));
  console.log(exampleConfigForme.value.advance_param);
};

defineExpose({
  init,
});
</script>
<template>
  <div class="config-detial">
    <buildConfig
      v-if="props.activeOption === 'build'"
      :buildConfigForme="buildConfigForme"
      :exampleConfigForme="exampleConfigForme"
      :exampleConfigId="exampleConfigId"
      :buildConfigId="buildConfigId"
      :activeConfig="activeConfig"
      @addBuildTableItem="addBuildTableItem"
      @deleteBuildTableItem="deleteBuildTableItem"
      @addExampleTableItem="addExampleTableItem"
      @deleteExampleTableItem="deleteExampleTableItem"
    />
    <sanitizerConfig v-if="props.activeOption === 'sanitizer'" />
    <opprofConfig v-if="props.activeOption === 'opprof'" />
  </div>
</template>

<style lang="less">
.config-detial {
  width: 750px;
  overflow-y: scroll;
  height: 100%;
  color: #ffffff;
  text-align: left;
  font-size: 14px;
  padding: 20px 32px;
}
</style>