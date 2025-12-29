<script setup lang="ts">
import { theme } from 'ant-design-vue';
import linkSSH from './components/linkSSH.vue';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="link-container">
      <div class="header-section">
        <div class="title">新建算子工程</div>
      </div>
      <div class="divider"></div>
      <div class="accend-c-link">
        <div class="content-section">
          <linkSSH />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less">
.link-container {
  width: 100%;
}

.header-section {
  display: flex;
  align-items: center;
  margin-bottom: 24px;

  .title {
    font-weight: 700;
    font-size: 24px;
    line-height: 28px;
    margin: 0;
    color: #fff;
    margin-right: 40px;
  }
}

.divider {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.15);
  margin-bottom: 24px;
  width: 100%;
}

.accend-c-link {
  color: #fff;

  .content-section {
    display: flex;
    flex-direction: column;
  }
}

#app {
  width: 100% !important;
  margin: 0 auto 0 10px !important;
  padding: 2rem;
  text-align: left;
  height: 100vh;
}
@import url('@/assets/less/common.less');
</style>
