<template>
  <div class="bg-container" :style="{
    backgroundImage: `url(${a})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundPosition: 'left center'
  }" @click="handleClick">
  </div>
</template>

<script>
import a from './a.json'
export default {
  data() {
    return {a: a.url }
  },
  methods: {
    handleClick() {
      //@ts-ignore
      if (window.vscode) {
        //@ts-ignore
        window.vscode.postMessage({
          command: 'vscodeOpenSidebar',
          message: {}
        });
      }
    }
  }
}
</script>

<style scoped>
.bg-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.content {
  background: rgba(255, 255, 255, 0.8);
  padding: 40px;
  border-radius: 10px;
  text-align: center;
}
</style>