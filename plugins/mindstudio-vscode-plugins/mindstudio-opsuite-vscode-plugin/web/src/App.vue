<script setup lang="ts">
import { ref } from 'vue';

import { getQuery } from '@/core/query';

const routePath = ref('');
getQuery().then(({ _path }) => {
  routePath.value = _path;
});
</script>

<template>
  <span>当前路由:{{ routePath }}</span>
</template>
