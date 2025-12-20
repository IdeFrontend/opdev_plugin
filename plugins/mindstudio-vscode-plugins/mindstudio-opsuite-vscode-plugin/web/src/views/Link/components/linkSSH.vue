<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, reactive, onBeforeUnmount, computed, onMounted } from "vue";
import { FolderOpenOutlined, RestOutlined, QuestionCircleOutlined, InboxOutlined } from "@ant-design/icons-vue";
import { getLocalData, setLoaclData } from "../../../untils/index";
import { message } from "../../../untils/Message";
import { message as antdMessage } from "ant-design-vue";
import multiStepModal from "./multiStepModal.vue";
import { installRemoteExtension, checkPathExists } from "@/apis";

const emit = defineEmits(["connected"]);

const props = defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

const tableData = ref([]);
const multiStepModalRef = ref();
const linkType = ref("choose");
const selectedRow = ref(null);
const projectPathOptions = ref([]);
const projectSHOptions = ref([]);
const projectPathLoading = ref(false);
const projectSHLoading = ref(false);
const connectionFormRef = ref(null);
const onSelectChange = (value) => {
  selectedRow.value = value;
};

const isRemote = ref(getLocalData("isRemote"));

// 工程类型相关
const selectedId_type = ref(1);
const selectedId_proto = ref(1);
const items_type = [
  { id: 1, title: '【Ascend C】<<<>>>算子工程', desc: '创建<<<>>>调用的addn工程样例，支持".asc"后缀的异构编译。' },
  // { id: 2, title: '【Ascend C】标准自定义算子工程', desc: '基于Ascend C语言的标准自定义算子工程，op_host存放在CPC侧的代码实现，op_kermel存放NPU侧的代码实现，op_graph存放图模式下的代码实现 <span style="color: #ff4d4f; font-weight: bold;">(因为该算子的编译依赖ops-math项目，该算子将自动放到ops-math项目中math目录中，后续提交代码需要迁移到自己的fork代码仓中操作)</span>' },
];
const items_proto = [
  { id: 1, title: '使用原型定义文件模版', desc: '从标准模版开始编写算子原型，完成后可基于此生成工程。' },
  { id: 2, title: '上传原型定义文件（json）', desc: '若您已有现成的算子原型文件，可直上传并生成工程' },
];
const tipBase_0 = 'data:image/png;base64,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';
const tipBase_1 = 'data:image/png;base64,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';
// JSON文件上传相关
const fileInput = ref(null);
const fileInfo = ref(null);
const jsonContent = ref('');
const isValidJSON = ref(false);
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
    antdMessage.error('只能上传JSON文件！');
    return;
  }

  // 验证文件大小
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    antdMessage.error('文件大小不能超过10MB！');
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
      antdMessage.success('JSON文件解析成功！');

      // 自动打印到控制台
      printToConsole();
    } catch (error) {
      isValidJSON.value = false;
      antdMessage.error('JSON格式错误：' + error.message);
    }
  };

  reader.onerror = () => {
    antdMessage.error('文件读取失败！');
  };

  reader.readAsText(file);
};

const printToConsole = () => {
  console.log('========== JSON文件内容 ==========');
  console.log('文件名:', fileInfo.value?.name);
  console.log('JSON内容:');
  console.log(jsonContent.value);
  console.log('=================================');
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// C++ 关键字列表
const CPP_KEYWORDS = [
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
  'case', 'catch', 'char', 'char16_t', 'char32_t', 'class', 'compl', 'const', 'constexpr',
  'const_cast', 'continue', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
  'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
  'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
  'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
  'reinterpret_cast', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert',
  'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local', 'throw', 'true',
  'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void',
  'volatile', 'wchar_t', 'while', 'xor', 'xor_eq'
];

// 生成默认算子工程名称 op_XXXXXX（随机六位数字）
const generateDefaultProjectName = () => {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `op_${num}`;
};

// 获取 HOME 环境变量路径
const getHomePath = () => {
  // 尝试从 process.env 获取（如果可用）
  if (typeof process !== 'undefined' && process.env && process.env.HOME) {
    return process.env.HOME;
  }

  // 如果都获取不到，使用默认值
  return "/home/developer";
};

// 表单数据
const projectFormData = reactive({
  // 算子工程位置默认值
  projectPath: getHomePath(),
  // 算子工程名称默认值
  projectName: generateDefaultProjectName(),
  // 环境变量配置脚本默认值
  projectSH: "/etc/profile",
});

// 表单校验规则
const connectionFormRules = {
  projectPath: [
    { required: true, message: '请输入算子工程位置', trigger: 'blur' },
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        const pathExists = await checkPathExists({ path: value, ssh: selectedRow.value });
        return pathExists ? Promise.resolve() : Promise.reject('目录不存在，请先创建目录');
      }
    }
  ],
  projectName: [
    { required: true, message: '请输入算子工程名称', trigger: 'blur' },
    {
      validator: (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        // 规则1: 只能使用字母、数字和下划线
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return Promise.reject('算子工程名称只能包含字母、数字和下划线');
        }
        // 规则2: 首字母必须是字母
        if (!/^[a-zA-Z]/.test(value)) {
          return Promise.reject('算子工程名称必须以字母开头');
        }
        // 规则3: 不能是C++关键字
        if (CPP_KEYWORDS.includes(value.toLowerCase())) {
          return Promise.reject('算子工程名称不能是C++关键字');
        }
        return Promise.resolve();
      },
      trigger: 'blur'
    }
  ],
  projectSH: [
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        const pathExists = await checkPathExists({ path: value, mustFile: true, ssh: selectedRow.value });
        return pathExists ? Promise.resolve() : Promise.reject('脚本文件不存在，请确认');
      }
    }
  ]
};

const buttonText = ref("确认");
const rateNumber = ref(0);
const maxRate = ref(10);

message.addMessageListener({
  command: "iframeRemoteSearchResult",
  callback: (resp) => {
    const { type, list = [] } = resp.data || {};
    const mapped = list.map((item) => ({ value: item.path }));
    if (type === "projectPath") {
      projectPathOptions.value = mapped;
      projectPathLoading.value = false;
    } else if (type === "projectSH") {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  },
});

const addRateLoop = () => {
  if (rateNumber.value < maxRate.value) {
    rateNumber.value++;
  } else if (rateNumber.value === maxRate.value && maxRate.value !== 100) {
    rateNumber.value = 0;
  }

  if (maxRate.value !== 100) {
    setTimeout(() => {
      addRateLoop();
    }, 50);
  } else {
    rateNumber.value = 100;
  }
};

const addItem = () => {
  multiStepModalRef.value.openConnectionDialog();
};

const updatedTable = () => {
  tableData.value = getLocalData("sshData") || [];

  if (props.connected === 1) {
    linkType.value = "config";
  } else if (tableData.value.length === 0) {
    linkType.value = "empty";
  } else {
    linkType.value = "choose";
  }
};

const deleteData = (index) => {
  tableData.value = tableData.value.filter((_, i) => i !== index);
  setLoaclData(
    "sshData",
    tableData.value.map((v) => v)
  );
  updatedTable();
};

const connectSSH = () => {
  buttonText.value = "连接中";
  linkType.value = "link";
  addRateLoop();

  installRemoteExtension(selectedRow.value).then(async (installStream) => {
    const reader = installStream.getReader();
    let result = await reader.read();
    while (!result.done) {
      maxRate.value = result.value;
      result = await reader.read();
    }
    connectSuccess();
  });
};

const cancelConnectSSH = () => {
  buttonText.value = "确定";
  linkType.value = "choose";
  rateNumber.value = 0;
  maxRate.value = 10;
};

const connectSuccess = () => {
  buttonText.value = "确定";
  linkType.value = "config";
  rateNumber.value = 0;
  maxRate.value = 0;
  console(selectedRow, 'change');
  projectFormData.projectPath = `/home/${selectedRow.value.username}`;
  emit("connected");
};

// 校验算子工程名称
const validateProjectName = (projectName) => {
  if (!projectName || projectName.trim() === '') {
    antdMessage.error('请输入算子工程名称');
    return false;
  }

  // 规则1: 只能使用字母、数字和下划线
  if (!/^[a-zA-Z0-9_]+$/.test(projectName)) {
    antdMessage.error('算子工程名称只能包含字母、数字和下划线');
    return false;
  }

  // 规则2: 首字母必须是字母
  if (!/^[a-zA-Z]/.test(projectName)) {
    antdMessage.error('算子工程名称必须以字母开头');
    return false;
  }

  // 规则3: 不能是C++关键字
  if (CPP_KEYWORDS.includes(projectName.toLowerCase())) {
    antdMessage.error('算子工程名称不能是C++关键字');
    return false;
  }

  return true;
};

const createdProject = async () => {
  // 先进行表单校验
  try {
    await connectionFormRef.value.validate();
  } catch (error) {
    return;
  }

  // 再次校验算子工程名称（双重校验确保）
  if (!validateProjectName(projectFormData.projectName)) {
    return;
  }

  message.sendMessageToParent({
    command: "vscodeCreatedProject",
    data: {
      ...projectFormData,
      ...selectedRow.value,
      createOperatorProjectDictoryFileType: selectedId_type.value,
    },
  });
};

const buildDefaultSearchPath = (value = "") => {
  if (value) return value;
  if (selectedRow.value?.username) {
    return `/home/${selectedRow.value.username}`;
  }
  return "/";
};

const remoteSearch = (type, keyword) => {
  const searchValue = keyword || "";
  if (type === "projectPath") {
    projectPathLoading.value = true;
  } else {
    projectSHLoading.value = true;
  }
  message.sendMessageToParent({
    command: "vscodeRemotePathSearch",
    type,
    keyword: buildDefaultSearchPath(searchValue.trim()),
    ssh: JSON.parse(JSON.stringify({ ...selectedRow.value })),
  });
};

onBeforeUnmount(() => {
  message.deleteMessageListener("iframeRemoteSearchResult");
});

updatedTable();

defineExpose({
  addItem,
});

const getBuildConfigItem = {
  command: 'iframeSetHome',
  callback: (message) => {
    console.log(message.data);
    const obj = message.data || '/home/developer';
    projectFormData.projectPath = obj;
  }
}

onMounted(() => {
  message.addMessageListener(getBuildConfigItem);
  message.sendMessageToParent({ command: 'vscodeGetHome' });
})
</script>
<template>
  <div class="link-box">
    <div v-if="linkType === 'empty'" class="empty-box">
      <div class="empty-icon">
        <FolderOpenOutlined style="font-size: 55px" />
      </div>
      <span>暂无已连接的远程开发环境，请新建连接</span>
      <a-button @click="addItem" type="primary">新建连接</a-button>
    </div>
    <div v-else-if="linkType === 'choose' || linkType === 'link'" class="choose-box">
      <div class="link-table">
        <div class="link-table-head">
          <span>名称</span>
        </div>
        <div class="link-table-body">
          <div class="link-table-cell" v-for="(item, index) in tableData" :key="item.name">
            <a-radio :disabled="linkType === 'link'" :checked="selectedRow === item"
              @change="() => onSelectChange(item)" />
            <span>{{ item.name }}</span>
            <RestOutlined class="icon" @click="deleteData(index)" />
          </div>
        </div>
      </div>
      <a-button @click="connectSSH" :disabled="selectedRow === null || buttonText === '连接中'" type="primary">{{
        buttonText }}
      </a-button>

      <div class="link-message" v-if="linkType === 'link'">
        <span> 正在连接远程环境 </span>
        <div class="rate-data" :style="{ width: `${rateNumber}%` }"></div>
        <a-button @click="cancelConnectSSH" v-if="linkType === 'link'">
          取消
        </a-button>
      </div>
    </div>
    <div v-else-if="linkType === 'config'" class="config-box">
      <div class="config-left-placeholder">
        <div class="section-title">工程类型</div>
        <div class="project-type-content">
          <!-- <div class="title-tip">根据使用场景选择对应的算子工程，快速生成代码模板框架。注：<strong>若已存在算子工程，再次生成将会覆盖原工程。</strong></div> -->
          <div class="project-type-select">
            <div v-for="item in items_type" :key="item.id" class="single-select-item left"
              :class="{ selected: selectedId_type === item.id }" @click="selectedId_type = item.id">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-desc" v-html="item.desc"></div>
              <a-tag color="blue">语言：Ascend C</a-tag>
              <a-tag v-if="item.id === 1" color="purple">类型：<<<>>></a-tag>
              <a-tag v-if="item.id === 2" color="green">类型：标准自定义</a-tag>
              <transition name="slide-fade">
                <div v-if="selectedId_type === item.id" class="project-structure-preview">
                  <div style="margin-bottom: 20px; margin-top: 20px;">工程目录结构示意</div>
                  <div class="image-wrapper">
                    <a-image :src="item.id === 1 ? tipBase_1 : tipBase_0" />
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div class="config-divider"></div>
      <div class="config-right-content">
        <div class="section-title">工程配置</div>
        <div v-if="!isRemote" class="config-title">
          <div>当前环境</div>
          <span>{{ props.connected === 1 ? "" : selectedRow?.name }}</span>
        </div>
        <a-form :model="projectFormData" :label-col="{ span: 6 }" :wrapper-col="{ span: 24 }" ref="connectionFormRef"
          :rules="connectionFormRules" layout="vertical">
          <a-form-item name="projectName">
            <template #label>
              <span>算子工程名称</span>
              <a-tooltip title="新建算子的名称，用于代码中的算子的定义，并默认用于工程名称。支持数字、字母、下划线">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-input v-model:value="projectFormData.projectName" placeholder="请输入算子工程名称（只能包含字母、数字和下划线，必须以字母开头）" />
          </a-form-item>
          <a-form-item name="projectPath">
            <template #label>
              <span>算子工程位置</span>
              <a-tooltip title="您所创建的算子工程的存储路径。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectPath" :options="projectPathOptions"
              :loading="projectPathLoading" placeholder="请输入工程位置，支持远程搜索"
              @search="(val) => remoteSearch('projectPath', val)"
              @focus="() => remoteSearch('projectPath', projectFormData.projectPath)" />
          </a-form-item>
          <a-form-item name="projectSH">
            <template #label>
              <span>环境变量配置脚本</span>
              <a-tooltip
                title="安装CANN包后需要执行的set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectSH" :options="projectSHOptions"
              :loading="projectSHLoading" placeholder="请输入环境变量.sh文件地址，支持远程搜索"
              @search="(val) => remoteSearch('projectSH', val)"
              @focus="() => remoteSearch('projectSH', projectFormData.projectSH)" />
          </a-form-item>
        </a-form>
        <a-button @click="createdProject" type="primary">立即创建</a-button>
      </div>
    </div>
    <multiStepModal ref="multiStepModalRef" @update="updatedTable" />
  </div>
</template>
<style scoped lang="less">
.link-table {
  width: 560px;

  .link-table-head {
    background-color: #262626;
    border-bottom: 1px solid #303030;
    color: #d7d7d7;
    font-size: 12px;
    line-height: 32px;
    font-weight: 500;
    height: 32px;

    span {
      display: block;
      margin-left: 55px;
      text-align: left;
    }
  }

  .link-table-body {
    max-height: 300px;
    overflow-y: auto;

    .link-table-cell {
      line-height: 32px;
      font-size: 12px;
      height: 33px;
      border-bottom: 1px solid #303030;

      label {
        float: left;
        margin: 5px 12px;
      }

      span {
        display: inline-block;
        margin-left: 17px;
        width: 70%;
        text-align: left;
        float: left;
      }

      .icon {
        display: none;
        float: right;
        margin-right: 15px;
        margin-top: 12px;
        color: #4ba5f4;
        width: 20px;
        cursor: pointer;
      }
    }

    .link-table-cell:hover {
      .icon {
        display: inline-block;
      }
    }
  }
}

.link-box {

  .empty-box {
    height: 240px;
    border-radius: 15px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding-top: 55px;
    display: flex;
    flex-direction: column;
    align-items: center;

    span {
      display: block;
      margin-bottom: 16px;
      color: rgba(255, 255, 255, 0.65);
    }
  }

  .choose-box {
    button {
      margin-top: 24px;
    }

    .link-message {
      width: 100%;
      margin-top: 65px;
      text-align: left;

      span {
        font-size: 14px;
        font-weight: 400;
        line-height: 22px;
      }
    }

    .rate-data {
      width: 50%;
      height: 8px;
      border-bottom: 1px solid #4ba5f4;
    }
  }

  .config-box {
    display: flex;
    width: 100%;
    align-items: stretch;

    .config-left-placeholder {
      width: 35%;

      .section-title {
        font-size: 16px;
        line-height: 22px;
        font-weight: 700;
        color: #fff;
        margin-bottom: 24px;
      }

      .project-type-content {
        .title-tip {
          margin-bottom: 20px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.5;
        }

        .project-type-select {
          margin-bottom: 20px;
        }

        .proto-select-section {
          margin-top: 20px;
        }

        .single-select-item {
          background: transparent;
          padding: 20px;
          margin: 20px 0;
          border: 1px solid #464646;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease-in-out;
          overflow: hidden;
          position: relative;

          &:hover {
            border-color: #4BA5F4;
            background: transparent;
            box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
          }

          &.selected {
            border-color: #4BA5F4;
            background: transparent;
            box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
          }

          .item-title {
            font-weight: 800;
            font-size: initial;
            margin-bottom: 25px;
            color: #fff;
          }

          .item-desc {
            line-height: 2;
            margin-top: 10px;
            color: white;
            font-size: 13px;
            margin-bottom: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          &.selected {
            .item-desc {
              white-space: normal;
              overflow: visible;
              text-overflow: unset;
            }
          }

          :deep(.ant-tag) {
            margin-top: 10px;
            margin-right: 8px;
          }

          .project-structure-preview {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            transition: all 0.3s ease-in-out;

            .image-wrapper {
              overflow: hidden;
              max-width: 100%;
              transition: all 0.3s ease-in-out;
            }

            :deep(.ant-image-img) {
              display: block;
              max-width: 100%;
              height: auto;
              object-fit: contain;
              transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
            }
          }

          // 展开/收缩动画
          .slide-fade-enter-active {
            transition: opacity 0.3s ease-out, transform 0.3s ease-out;
            overflow: hidden;
          }

          .slide-fade-leave-active {
            transition: opacity 0.3s ease-in, transform 0.3s ease-in;
            overflow: hidden;
          }

          .slide-fade-enter-from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }

          .slide-fade-enter-to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }

          .slide-fade-leave-from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }

          .slide-fade-leave-to {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
        }

        .left-right-box {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          flex-wrap: nowrap;
        }

        .left {
          flex: 1 0 360px;
          min-width: 300px;
          flex-shrink: 0;
        }

        .right {
          flex: 0 1 420px;
          min-width: 240px;
        }

        .image-wrapper {
          overflow: hidden;
          max-width: 100%;
        }

        :deep(.right .ant-image-img) {
          display: block;
          max-width: 100%;
          height: auto;
          object-fit: contain;
        }

        .upload-area {
          border: 2px dashed #d9d9d9;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          background: none;
          transition: border-color 0.3s;

          &:hover {
            border-color: #1890ff;
          }
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
          color: #fff;
        }

        .file-info {
          margin-top: 20px;
        }

        :deep(.ant-divider-inner-text) {
          color: white !important;
        }

        :deep(.ant-descriptions-view) {
          border: 1px solid white !important;
        }

        :deep(.ant-descriptions-row) {
          border: 1px solid white !important;
        }

        :deep(.ant-descriptions-item-label) {
          color: white !important;
          border-inline-end: 1px solid white !important;
        }

        :deep(.ant-descriptions-item-content) {
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
      }
    }

    .config-divider {
      width: 1px;
      background-color: rgba(255, 255, 255, 0.15);
      margin-left: 16px;
      margin-right: 16px;
      flex-shrink: 0;
      align-self: stretch;
    }

    .config-right-content {
      width: 65%;
      text-align: left;
      font-size: 14px;
      font-weight: 400;
      line-height: 22px;

      .section-title {
        font-size: 16px;
        line-height: 22px;
        font-weight: 700;
        color: #fff;
        margin-bottom: 24px;
      }

      div {
        margin-bottom: 8px;
      }

      .config-title {
        display: block;
        margin-bottom: 24px;
      }

      button {
        margin-top: 24px;
      }

      :deep(.ant-form-item-label) {
        .help-icon {
          color: rgba(255, 255, 255, 0.45);
          cursor: help;
          font-size: 14px;
          margin-left: 4px;
        }
      }
    }
  }

  button {
    width: 84px;
    height: 32px;
    border-radius: 0;
  }
}

/* 针对整个页面的滚动条 */
::-webkit-scrollbar {
  width: 12px;
  /* 垂直滚动条宽度 */
  height: 12px;
  /* 水平滚动条高度 */
}

/* 滚动条轨道 */
::-webkit-scrollbar-track {
  background: #f1f1f1;
  /* 轨道背景色 */
  border-radius: 6px;
  /* 轨道圆角 */
}

/* 滚动条滑块 */
::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  /* 滑块颜色 */
  border-radius: 6px;
  /* 滑块圆角 */
  border: 2px solid #f1f1f1;
  /* 滑块边框，与轨道背景色相同形成间隔效果 */
}

/* 滑块悬停状态 */
::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
  /* 悬停时颜色变深 */
}

/* 滑块激活状态（点击时） */
::-webkit-scrollbar-thumb:active {
  background: #787878;
  /* 点击时颜色更深 */
}

/* 滚动条角落（垂直和水平滚动条交汇处） */
::-webkit-scrollbar-corner {
  background: #f1f1f1;
}
</style>