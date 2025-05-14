const { createApp, ref, onMounted, computed, defineComponent } = Vue;
const vscode = acquireVsCodeApi();

const app = Vue.createApp({
    template: `
        <table class="table-panel">
        <thead>
            <tr>
                <td>Key</td>
                <td>Value</td>
            </tr>
        </thead>
        <tbody>
            <tr v-for="i in tableData">
                <td class="key">{{ i.name }}</td>
                <td class="value">{{ i.value }}</td>
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

        return {
            tableData
        };
    }
});

app.use(ElementPlus);
app.mount("#app");
