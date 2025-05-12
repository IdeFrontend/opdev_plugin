const { createApp, ref, onMounted, computed } = Vue;
const vscode = acquireVsCodeApi();

const app = Vue.createApp({
    setup() {
        const tableData = ref([]);
        const currentId = ref('');

        window.addEventListener('message', ({ data }) => {
            if (!data) return;

            tableData.value = data.allKernel;
            currentId.value = data.type + ' ' + data.focusId;
        });

        onMounted(() => {
            vscode.postMessage({ type: 'init' });
        });

        function changeKernel(value) {
            vscode.postMessage({ type: 'value', value });
        }

        return {
            tableData, currentId, changeKernel
        };
    }
});

app.use(ElementPlus);
app.mount("#app");
