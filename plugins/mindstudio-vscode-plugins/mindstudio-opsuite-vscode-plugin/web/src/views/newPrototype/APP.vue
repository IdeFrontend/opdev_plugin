<template>
  <div class="accend-c-link">
    <div class="title">新建算子原型定义文件</div>
    <div class="single-select-group">
      <div v-for="item in items" :key="item.id" class="single-select-item" :class="{ selected: selectedId === item.id }"
        @click="selectedId = item.id">
        <div class="item-title">{{ item.title }}</div>
        <div class="item-desc">{{ item.desc }}</div>
      </div>
    </div>
    <div class="link-row">
      <a-button @click="connectSSH" type="primary">确认 </a-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const selectedId = ref();
const items = [
  { id: 1, title: 'AddCustom', desc: 'Add算子实现了两个数据相加，返回相加结果的功能。本样例算子添加的模版参数包括输入的数据类型、shape等' },
  //   { id: 2, title: 'AddnCustom', desc: 'Addn算子实现了两个数据相加，返回相加结果的功能，其中核函数的输入参数为动态输入，动态输入参数包含两个参数，x和y' },
  //   { id: 3, title: 'BroadcastCustom', desc: 'Broadcast算子实现了将输入数据按照输出shape进行广播的功能' },
];
const connectSSH = () => {
    //@ts-ignore
    window.vscode.postMessage({
      command: 'startLinkCreateOps',
      commandId: 'startLinkCreateOps'
    });
  console.log(val, '开始请求');
}
</script>



<style scoped lang="less">
.accend-c-link {
  color: #fff;
  display: flex;
  flex-direction: column;
  /* 垂直排列 */
  align-items: center;
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
  margin: 10px 0;
  border: 1px solid #464646;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.single-select-item:hover {
  border-color: #4BA5F4;
  background: #464646;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.single-select-item.selected {
  border-color: #4BA5F4;
  background: #464646;
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.item-title {
  font-weight: bold;
  margin-bottom: 5px;
}

.item-desc {
  margin-top: 10px;
  color: white;
  font-size: 14px;
}
</style>