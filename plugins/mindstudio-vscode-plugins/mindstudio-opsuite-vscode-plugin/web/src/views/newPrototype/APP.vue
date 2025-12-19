<template>
  <div class="accend-c-link">
    <div class="single-select-group">
      <div class="title">生成算子工程目录文件</div>
      <div class="title-tip">根据使用场景选择对应的算子工程，快速生成代码模板框架。注：<strong>若已存在算子工程，再次生成将会覆盖原工程。</strong></div>
      <div>选择工程类型</div>
      <div class="left-right-box">
        <div>
          <div v-for="item in items_type" :key="item.id" class="single-select-item left"
            :class="{ selected: selectedId_type === item.id }" @click="selectedId_type = item.id">
            <div class="item-title">{{ item.title }}</div>
            <div class="item-desc" v-html="item.desc"></div>
          </div>
        </div>
        <div class="single-select-item right">
          <div style="margin-bottom: 20px;">工程目录结构示意</div>
          <div class="image-wrapper">
            <a-image :src="selectedId_type === 1 ? tipBase_1 : tipBase_0" />
          </div>
        </div>
      </div>
      <div>
        <div v-if="selectedId_type === 3">
          <div style="margin-bottom: 20px;">2.工程配置</div>
          <a-checkbox-group v-model:value="state.value1" :options="options" style="color: white;" />
        </div>
        <div v-if="selectedId_type === 4">
          <div>选择算子原型定义文件</div>
          <div class="left-right-box">
            <div v-for="item in items_proto" :key="item.id" class="single-select-item left"
              :class="{ selected: selectedId_proto === item.id }" @click="selectedId_proto = item.id">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-desc">{{ item.desc }}</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="selectedId_type === 2 && selectedId_proto === 2" class="json-upload-container">
        <div class="single-select-item">
          <div class="upload-area" @click="triggerFileInput" @dragover.prevent @drop="handleDrop">
            <input ref="fileInput" type="file" accept=".json" @change="handleFileSelect" style="display: none" />
            <div class="upload-content">
              <p class="ant-upload-drag-icon">
                <inbox-outlined></inbox-outlined>
              </p>
              <p class="ant-upload-text">点击或拖拽JSON文件到此区域上传</p>
            </div>
          </div>
          <div v-if="fileInfo" class="file-info">
        <a-divider>文件信息</a-divider>
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="文件名">
            {{ fileInfo.name }}
          </a-descriptions-item>
          <a-descriptions-item label="文件大小">
            {{ formatFileSize(fileInfo.size) }}
          </a-descriptions-item>
        </a-descriptions>
      </div>
        </div>
      </div>
      <div class="link-row">
        <a-button @click="connectSSH" type="primary">确认 </a-button>
      </div>
    </div>
  </div>
</template>

<script setup>

import { ref, computed, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { InboxOutlined, PrinterOutlined } from '@ant-design/icons-vue';

import { message as utilMessage } from "../../untils/Message";

const fileInput = ref(null);
const fileInfo = ref(null);
const jsonContent = ref('');
const isValidJSON = ref(false);

const tipBase_0 = 'data0';
const tipBase_1 = 'data1';
const previewLength = computed(() => 500);
const previewContent = computed(() => {
  if (!jsonContent.value) return '';
  return jsonContent.value.substring(0, previewLength.value) +
    (jsonContent.value.length > previewLength.value ? '...' : '');
});

const triggerFileInput = () => {
  fileInput.value.click();
};

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  handleFile(file);
};

const handleDrop = (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;

  handleFile(file);
};

const handleFile = (file) => {
  // 验证文件类型
  const isJson = file.type === 'application/json' || file.name.endsWith('.json');
  if (!isJson) {
    message.error('只能上传JSON文件！');
    return;
  }

  // 验证文件大小
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    message.error('文件大小不能超过10MB！');
    return;
  }

  fileInfo.value = {
    name: file.name,
    size: file.size
  };

  readJsonFile(file);
};

const readJsonFile = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      jsonContent.value = content;

      // 验证JSON格式
      JSON.parse(content);
      isValidJSON.value = true;
      message.success('JSON文件解析成功！');

      // 自动打印到控制台
      printToConsole();
    } catch (error) {
      isValidJSON.value = false;
      message.error('JSON格式错误：' + error.message);
    }
  };

  reader.onerror = () => {
    message.error('文件读取失败！');
  };

  reader.readAsText(file);
};

const printToConsole = () => {
  console.log('========== JSON文件内容 ==========');
  console.log('文件名:', fileInfo.value?.name);
  console.log('JSON内容:');
  console.log(jsonContent.value);
  console.log('=================================');
  // message.success('已打印到控制台');
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const selectedId_type = ref(1);
const selectedId_proto = ref(1);
const state = reactive({
  value1: [],
});

const options = [
  { label: '使用pybind', value: '0' },
  { label: '使用pybind', value: '1' },
];
const items_type = [
  { id: 1, title: '<<<>>>算子工程', desc: '生成一个使用<<<>>>内核调用符进行算子直调的hello_world样例，代码文件采用".asc"后缀支持异构编译。' },
  { id: 2, title: '标准自定义算子工程', desc: 'op_host存放CPU侧的代码实现，op_kernel存放NPU侧的代码实现，op_graph存放图模式下的代码实现（需要下载<a href="https://gitcode.com/cann/ops-math">ops-math工程</a>,并将该算子放入到op-math/math目录下，才能编译）' },
];

const items_proto = [
  { id: 1, title: '使用原型定义文件模版', desc: '从标准模版开始编写算子原型，完成后可基于此生成工程。' },
  { id: 2, title: '上传原型定义文件（json）', desc: '若您已有现成的算子原型文件，可直上传并生成工程' },
];
const connectSSH = () => {
  //@ts-ignore
  console.log('点击确定',selectedId_type.value, selectedId_proto.value);
  if (selectedId_type.value === 1) {
    utilMessage.sendMessageToParent({
      command: "vscodeBuildCreateOps",
      data: 'cann'
    });
    return
  }
  if (selectedId_type.value === 2 && selectedId_proto.value === 1) {
    utilMessage.sendMessageToParent({
      command: "vscodeStartLinkCreateOps",
    });
    return
  }
  if (selectedId_type.value === 2 && selectedId_proto.value === 2) {
    utilMessage.sendMessageToParent({
      command: "vscodeStartLinkCreateOps",
      data: {fileName: fileInfo.value.name, value: jsonContent.value}
    });
    return
  }

}
</script>



<style scoped lang="less">
.accend-c-link {
  color: #fff;
  display: flex;
  flex-direction: column;
  /* 垂直排列 */
  // align-items: center;
  /* 水平居中 */
  justify-content: center;
  /* 垂直居中（可选）*/
  width: 100%;
  /* 给父容器一个宽度 */
  margin-top: 50px;
}

.accend-c-link {
  .title {
    font-weight: 700;
    font-size: 24px;
    line-height: 28px;
    margin-bottom: 10px;
  }

  .button-add-link {
    font-weight: 400;
    font-size: 14px;
    line-height: 22px;
  }
}

.container {
  padding: 20px;
  background: #464646;
  min-height: 100vh;
}

.single-select-group {
  width: 50%;
  margin: 0 auto;
}

.single-select-item {
  background: #2f2f2f;
  padding: 20px;
  margin: 20px 0;
  border: 1px solid #464646;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.single-select-item:hover {
  border-color: #4BA5F4;
  background: #2f2f2f;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.single-select-item.selected {
  border-color: #4BA5F4;
  background: #2f2f2f;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.item-title {
  font-weight: 800;
  font-size: initial;
  margin-bottom: 25px;
}

.item-desc {
  line-height: 2;
  margin-top: 10px;
  color: white;
  font-size: 13px;
}

.title-tip {
  margin-bottom: 40px;
}

.upload-area {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  background: white;
  transition: border-color 0.3s;
}

.upload-area:hover {
  border-color: #1890ff;
}

.upload-content {
  pointer-events: none;
}

.ant-upload-drag-icon {
  color: #1890ff;
  font-size: 48px;
  margin-bottom: 16px;
}

.ant-upload-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
}

.ant-upload-hint {
  color: rgba(0, 0, 0, 0.45);
}

.file-info,
.json-preview {
  margin-top: 20px;
}

.action-buttons {
  margin-top: 12px;
}

.left-right-box {
  display: flex;
  gap: 20px; /* 两列之间的间距 */
  align-items: flex-start;
  flex-wrap: nowrap;
}

.left {
  flex: 1 0 360px; /* 左侧保持宽度，不压缩 */
  min-width: 300px;
  flex-shrink: 0;
}

.right {
  flex: 0 1 420px; /* 右侧优先被压缩 */
  min-width: 240px;
}

.image-wrapper {
  overflow: hidden;
  max-width: 100%;
}

/* 保证图片不会撑破容器 */
:deep(.right .ant-image-img) {
  display: block;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}


.ant-checkbox-group {
  display: flex;
  flex-direction: column;
  /* 纵向排列 */
  gap: 10px;

}

:deep(.ant-checkbox-group-item) {
  color: white;
}

:deep(.upload-area) {
  background: none !important;
}

.link-row {
  margin-top: 30px;
}

:deep(.ant-divider-inner-text){
  color: white !important;
}

:deep(.ant-descriptions-view){
  border: 1px solid white !important;
}

:deep(.ant-descriptions-row){
  border: 1px solid white !important;
}

:deep(.ant-descriptions-item-label){
  color: white !important;
  border-inline-end: 1px solid white !important;
}

:deep(.ant-descriptions-item-content){
  color: white !important;
}
@media (max-width: 960px) {
  .left-right-box {
    flex-wrap: wrap;
  }

  .left {
    flex: 1 0 100%;
    min-width: 0;
  }

  .right {
    flex: 0 1 100%;
    min-width: 0;
  }
}
</style>