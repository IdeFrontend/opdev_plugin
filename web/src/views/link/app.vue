<script setup lang="ts">
import { theme } from 'ant-design-vue';
import linkSSH from './components/link-ssh.vue';

const themeConfig = {
  algorithm: theme.darkAlgorithm, // 使用暗色算法[1](@ref)
};
</script>
<template>
  <a-config-provider :theme="themeConfig">
    <div class="!w-full !ml-[10px] !mr-auto !p-8 !text-left !h-screen">
      <div class="flex items-center mb-6">
        <div class="font-bold text-2xl leading-7 m-0 text-white mr-10">
          新建算子工程
        </div>
      </div>
      <div class="h-px bg-white/15 mb-6 w-full"></div>
      <div class="text-white">
        <div class="flex flex-col">
          <linkSSH />
        </div>
      </div>
    </div>
  </a-config-provider>
</template>
