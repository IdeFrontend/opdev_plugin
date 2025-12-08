<script setup >
import { ref, reactive } from "vue";
import { message } from "ant-design-vue";
import { FileOutlined } from "@ant-design/icons-vue";
import { getLocalData, setLoaclData } from "../../../untils/index";
import { message as msg } from "../../../untils/Message";

// 定义组件事件
const emit = defineEmits(["update"]);

// 弹窗显示状态
const isConnectionDialogVisible = ref(false);
const isAuthenticationDialogVisible = ref(false);

// 加载状态
const isConnectionDialogLoading = ref(false);
const isAuthenticationDialogLoading = ref(false);

// 表单引用
const connectionFormRef = ref();
const authenticationFormRef = ref();

// 表单数据
const connectionFormData = reactive({
  userName: "",
  ipAddress: "",
});

const authenticationFormData = reactive({
  password: "",
});

// 表单验证规则
const connectionFormRules = {
  userName: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  ipAddress: [
    { required: true, message: "请输入IP地址", trigger: "blur" },
    {
      pattern:
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      message: "请输入有效的IP地址",
      trigger: "blur",
    },
  ],
};

const authenticationFormRules = {
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

// 打开连接信息弹窗
const openConnectionDialog = () => {
  isConnectionDialogVisible.value = true;
  // 重置表单数据
  resetFormData();
};

// 重置所有表单数据
const resetFormData = () => {
  Object.assign(connectionFormData, { userName: "", ipAddress: "" });
  Object.assign(authenticationFormData, { password: "" });
};

// 处理连接信息提交
const handleConnectionInfoSubmit = async () => {
  try {
    // 验证表单
    await connectionFormRef.value.validate();

    isConnectionDialogLoading.value = true;

    isConnectionDialogLoading.value = false;
    isConnectionDialogVisible.value = false;
    isAuthenticationDialogVisible.value = true;
  } catch (validationError) {
    console.log("表单验证失败:", validationError);
  }
};

// 处理身份验证提交
const handleAuthenticationSubmit = async () => {
  try {
    // 验证表单
    await authenticationFormRef.value.validate();

    isAuthenticationDialogLoading.value = true;

    // 准备返回的数据
    const userInputData = {
      command: "vscodeSshValidate",
      username: connectionFormData.userName,
      host: connectionFormData.ipAddress,
      password: authenticationFormData.password,
      remotePath: "/",
    };

    const item = {
      command: "iframeSshValidateEnd",
      callback: handleAuthenticationClose,
    };
    msg.addMessageListener(item);
    msg.sendMessageToParent(userInputData);
  } catch (validationError) {
    console.log("表单验证失败:", validationError);
  }
};

const handleAuthenticationClose = (messageData) => {
  if (messageData.data.isConnected) {
    const sshData = getLocalData("sshData");
    console.log(sshData);
    sshData.unshift({
      name: `${connectionFormData.userName}@${connectionFormData.ipAddress}`,
      username: connectionFormData.userName,
      host: connectionFormData.ipAddress,
      password: authenticationFormData.password,
      port: 22,
    });
    setLoaclData("sshData", sshData);
    emit("update");
    message.success("验证成功！");
    isAuthenticationDialogLoading.value = false;
    isAuthenticationDialogVisible.value = false;
  } else {
    isAuthenticationDialogLoading.value = false;
    isAuthenticationDialogVisible.value = false;
    message.warn("验证失败，请重新添加远程服务器！");
  }
  // 显示成功消息
};

// 关闭所有弹窗
const closeAllDialogs = () => {
  isConnectionDialogVisible.value = false;
  isAuthenticationDialogVisible.value = false;
  message.info("操作已取消");
};

defineExpose({
  openConnectionDialog,
});
</script>

<template>
  <div>
    <!-- 第一步：连接信息弹窗 -->
    <a-modal
      v-model:visible="isConnectionDialogVisible"
      :confirm-loading="isConnectionDialogLoading"
      @ok="handleConnectionInfoSubmit"
      @cancel="closeAllDialogs"
      ok-text="确定"
      cancel-text="取消"
      :width="660"
      style="top: 40vh"
    >
      <div class="add-item-dialog ant-dialog">
        <div class="title"><FileOutlined class="icon" />新建连接</div>
        <div class="text">连接到SSH</div>
        <a-form
          :model="connectionFormData"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          ref="connectionFormRef"
          :rules="connectionFormRules"
          layout="vertical"
        >
          <a-form-item label="user name" name="userName">
            <a-input
              v-model:value="connectionFormData.userName"
              placeholder="请输入用户名"
              @pressEnter="handleConnectionInfoSubmit"
            />
          </a-form-item>

          <a-form-item label="IP" name="ipAddress">
            <a-input
              v-model:value="connectionFormData.ipAddress"
              placeholder="请输入IP地址"
              @pressEnter="handleConnectionInfoSubmit"
            />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <!-- 第二步：身份验证弹窗 -->
    <a-modal
      v-model:visible="isAuthenticationDialogVisible"
      :confirm-loading="isAuthenticationDialogLoading"
      @ok="handleAuthenticationSubmit"
      @cancel="closeAllDialogs"
      ok-text="确定"
      cancel-text="取消"
      :width="660"
      style="top: 40vh"
    >
      <div class="ant-dialog">
        <div class="title">身份验证</div>
        <div class="text">
          正在将身份验证到{{ connectionFormData.userName }}@{{
            connectionFormData.ipAddress
          }}
        </div>

        <a-form
          :model="authenticationFormData"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          ref="authenticationFormRef"
          :rules="authenticationFormRules"
          layout="vertical"
        >
          <a-form-item label="Key" name="password">
            <a-input-password
              v-model:value="authenticationFormData.password"
              placeholder="请输入密码"
              @pressEnter="handleAuthenticationSubmit"
            />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>



<style scoped lang="less">
.add-item-dialog {
  .icon {
    color: #1677ff;
    margin-right: 5px;
  }
}

.authentication-hint .anticon {
  margin-right: 8px;
  font-size: 16px;
}
</style>