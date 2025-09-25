const { createApp, ref, onMounted, computed, defineComponent } = Vue;
const vscode = acquireVsCodeApi();

const app = Vue.createApp({
    template: `
        <table class="table-panel" style="width: 100%">
        <thead>
            <tr>
                <td>read memory</td>
                <td>Id</td>
                <td>DataType</td>
                <td>MemType</td>
                <td>Addr</td>
                <td>Size</td>
                <td>CoreId</td>
                <td>dim</td>
            </tr>
        </thead>
        <tbody>
            <tr v-for="i in tableData">
                <td>
                    <el-button size="small" @click="goMemory(i)">memory</el-button>
                </td>
                <td v-for="j in i ">{{ j }}</td>
            </tr>
        </tobody>
        </table>
    `,
    setup() {
        const tableData = ref([]);

        window.addEventListener('message', ({ data }) => {
            if (!data) return;

            tableData.value = data.table;
        });

        onMounted(() => {
            vscode.postMessage({ type: 'init' });
        });

        function goMemory(row) {
            vscode.postMessage({ type: 'readMemory', data: [...row] });
        }

        return {
            tableData,
            goMemory
        };
    }
});

app.use(ElementPlus);
app.mount("#app");
