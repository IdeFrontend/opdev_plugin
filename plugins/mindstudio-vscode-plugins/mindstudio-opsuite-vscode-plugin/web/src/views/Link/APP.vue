<!-- 
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree. -->

<script setup>
import { theme } from "ant-design-vue";
import linkSSH from "./components/linkSSH.vue";
import { getLocalData } from "../../untils/index";
import { PlusOutlined } from "@ant-design/icons-vue";
import { ref } from "vue";
const current = ref(getLocalData("isRemote") ? 1 : 0);
const items = [{ title: "连接远程开发环境" }, { title: "工程配置" }];
const linkSSHRef = ref();
const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
const addLink = () => {
  linkSSHRef.value.addItem();
};
const connected = () => {
  current.value = 1;
};
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="accend-c-link">
      <div class="title">新建 Accend C 工程</div>
      <div class="steps">
        <a-steps :current="current" :items="items"></a-steps>
      </div>
      <div class="link-row" v-if="current !== 1">
        <span class="label">远程开发环境</span>
        <div class="link-add" @click="addLink">
          <PlusOutlined />
          <span class="button-add-link">新建链接</span>
        </div>
      </div>
      <linkSSH ref="linkSSHRef" @connected="connected" :connected="current" />
    </div>
  </a-config-provider>
</template>

<style lang="less">
.accend-c-link {
  color: #fff;
  width: 560px;
}
.accend-c-link {
  .link-row {
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    color: rgba(255, 255, 255, 0.88);

    .label {
      font-weight: 400;
      font-size: 14px;
      line-height: 20px;
    }

    .link-add {
      svg {
        display: inline-block;
        margin-right: 5px;
      }
    }

    .link-add {
      color: #4ba5f4;
      cursor: pointer;
    }
  }

  .title {
    font-weight: 700;
    font-size: 24px;
    line-height: 28px;
  }

  .button-add-link {
    font-weight: 400;
    font-size: 14px;
    line-height: 22px;
  }

  .steps {
    margin-top: 55px;
    margin-bottom: 50px;
    width: 330px;
    font-weight: 500;
    font-size: 16px;
    line-height: 24px;

    .ant-steps-item-title::after {
      background-color: rgba(255, 255, 255, 0.45) !important;
    }

    .ant-steps-item-finish {
      .ant-steps-item-title {
        color: #fff !important;
      }
    }

    .ant-steps-item-active {
      .ant-steps-item-title {
        color: #fff !important;
      }
    }

    .ant-steps-item-wait {
      .ant-steps-item-icon {
        border-color: rgba(255, 255, 255, 0.45) !important;

        .ant-steps-icon {
          color: rgba(255, 255, 255, 0.45) !important;
        }
      }

      .ant-steps-item-title {
        color: rgba(255, 255, 255, 0.45) !important;
      }
    }
  }
}
</style>

<style lang="less">
@import url("@/assets/less/common.less");
</style>