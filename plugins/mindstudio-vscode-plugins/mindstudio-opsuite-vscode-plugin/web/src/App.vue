<script setup lang="ts">
import { health } from './server/index';
async function init(){
  console.log(await health())
}
init()
</script>

<template>
  <div class="accend-c-link">
    <div class="title">新建 Accend C 工程</div>
    <div class="link-row">
      <span class="label">远程开发环境</span>
      <span class="button-add-link">新建链接</span>
    </div>
  </div>
</template>

<style>
body{
  background: #1E1E1E;
}
.accend-c-link {
  color: #fff;
  width: 560px;
}
.accend-c-link .link-row{
  display: flex;
  justify-content: space-between;
  color: rgba(255,255,255,0.88);
}

.accend-c-link .title {
  font-weight: 700;
  font-size: 24px;
  line-height: 28px;
}

.accend-c-link .label {
  font-weight: 400;
  font-size: 14px; 
  line-height: 20px;
}

.accend-c-link .button-add-link {
  font-weight: 400;
  font-size: 14px;
  line-height: 22px;
}
</style>
