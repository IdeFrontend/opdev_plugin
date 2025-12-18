<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { ref, reactive, onBeforeUnmount } from "vue";
import { FolderOpenOutlined, RestOutlined } from "@ant-design/icons-vue";
import { getLocalData, setLoaclData } from "../../../untils/index";
import { message } from "../../../untils/Message";
import { message as antdMessage } from "ant-design-vue";
import multiStepModal from "./multiStepModal.vue";
import { installRemoteExtension } from "@/apis";

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

// 表单数据
const projectFormData = reactive({
  projectPath: isRemote.value ? getLocalData("userInfo")?.homedir || "/home" : "",
  projectName: "",
  projectSH: "",
});

// 表单校验规则
const connectionFormRules = {
  projectName: [
    { required: true, message: '请输入工程名称', trigger: 'blur' },
    {
      validator: (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        // 规则1: 只能使用字母、数字和下划线
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return Promise.reject('工程名称只能包含字母、数字和下划线');
        }
        // 规则2: 首字母必须是字母
        if (!/^[a-zA-Z]/.test(value)) {
          return Promise.reject('工程名称必须以字母开头');
        }
        // 规则3: 不能是C++关键字
        if (CPP_KEYWORDS.includes(value.toLowerCase())) {
          return Promise.reject('工程名称不能是C++关键字');
        }
        return Promise.resolve();
      },
      trigger: 'blur'
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
  projectFormData.projectPath = `/home/${selectedRow.value.username}`;
  emit("connected");
};

// 校验工程名称
const validateProjectName = (projectName) => {
  if (!projectName || projectName.trim() === '') {
    antdMessage.error('请输入工程名称');
    return false;
  }

  // 规则1: 只能使用字母、数字和下划线
  if (!/^[a-zA-Z0-9_]+$/.test(projectName)) {
    antdMessage.error('工程名称只能包含字母、数字和下划线');
    return false;
  }

  // 规则2: 首字母必须是字母
  if (!/^[a-zA-Z]/.test(projectName)) {
    antdMessage.error('工程名称必须以字母开头');
    return false;
  }

  // 规则3: 不能是C++关键字
  if (CPP_KEYWORDS.includes(projectName.toLowerCase())) {
    antdMessage.error('工程名称不能是C++关键字');
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

  // 再次校验工程名称（双重校验确保）
  if (!validateProjectName(projectFormData.projectName)) {
    return;
  }

  message.sendMessageToParent({
    command: "vscodeCreatedProject",
    data: {
      ...projectFormData,
      ...selectedRow.value,
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
    ssh: JSON.parse(JSON.stringify({...selectedRow.value})),
  });
};

onBeforeUnmount(() => {
  message.deleteMessageListener("iframeRemoteSearchResult");
});

updatedTable();

defineExpose({
  addItem,
});
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
    <div
      v-else-if="linkType === 'choose' || linkType === 'link'"
      class="choose-box"
    >
      <div class="link-table">
        <div class="link-table-head">
          <span>名称</span>
        </div>
        <div class="link-table-body">
          <div
            class="link-table-cell"
            v-for="(item, index) in tableData"
            :key="item.name"
          >
            <a-radio
              :disabled="linkType === 'link'"
              :checked="selectedRow === item"
              @change="() => onSelectChange(item)"
            />
            <span>{{ item.name }}</span>
            <RestOutlined class="icon" @click="deleteData(index)" />
          </div>
        </div>
      </div>
      <a-button
        @click="connectSSH"
        :disabled="selectedRow === null || buttonText === '连接中'"
        type="primary"
        >{{ buttonText }}
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
      <div class="config-title">
        <div>当前环境</div>
        <span>{{ props.connected === 1 ? "" : selectedRow.name }}</span>
      </div>
      <a-form
        :model="projectFormData"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 24 }"
        ref="connectionFormRef"
        :rules="connectionFormRules"
        layout="vertical"
      >
        <a-form-item label="工程位置" name="userName">
          <a-auto-complete
            v-model:value="projectFormData.projectPath"
            :options="projectPathOptions"
            :loading="projectPathLoading"
            placeholder="请输入工程位置，支持远程搜索"
            @search="(val) => remoteSearch('projectPath', val)"
            @focus="() => remoteSearch('projectPath', projectFormData.projectPath)"
          />
        </a-form-item>

        <a-form-item label="工程名称" name="projectName">
          <a-input
            v-model:value="projectFormData.projectName"
            placeholder="请输入工程名称（只能包含字母、数字和下划线，必须以字母开头）"
          />
        </a-form-item>
        <a-form-item label="环境变量配置脚本" name="ipAddress">
          <a-auto-complete
            v-model:value="projectFormData.projectSH"
            :options="projectSHOptions"
            :loading="projectSHLoading"
            placeholder="请输入环境变量.sh文件地址，支持远程搜索"
            @search="(val) => remoteSearch('projectSH', val)"
            @focus="() => remoteSearch('projectSH', projectFormData.projectSH)"
          />
        </a-form-item>
      </a-form>
      <a-button @click="createdProject" type="primary">立即创建</a-button>
    </div>
    <multiStepModal ref="multiStepModalRef" @update="updatedTable" />
  </div>
</template>
<style  scoped lang="less">
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
  width: 560px;

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
      float: left;
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
    float: left;
    text-align: left;
    font-size: 14px;
    font-weight: 400;
    line-height: 22px;
    width: 100%;
    div {
      margin-bottom: 8px;
    }

    .config-title {
      display: block;
      margin-bottom: 24px;
    }

    button {
      float: left;
      margin-top: 24px;
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
  width: 12px; /* 垂直滚动条宽度 */
  height: 12px; /* 水平滚动条高度 */
}

/* 滚动条轨道 */
::-webkit-scrollbar-track {
  background: #f1f1f1; /* 轨道背景色 */
  border-radius: 6px; /* 轨道圆角 */
}

/* 滚动条滑块 */
::-webkit-scrollbar-thumb {
  background: #c1c1c1; /* 滑块颜色 */
  border-radius: 6px; /* 滑块圆角 */
  border: 2px solid #f1f1f1; /* 滑块边框，与轨道背景色相同形成间隔效果 */
}

/* 滑块悬停状态 */
::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8; /* 悬停时颜色变深 */
}

/* 滑块激活状态（点击时） */
::-webkit-scrollbar-thumb:active {
  background: #787878; /* 点击时颜色更深 */
}

/* 滚动条角落（垂直和水平滚动条交汇处） */
::-webkit-scrollbar-corner {
  background: #f1f1f1;
}
</style>