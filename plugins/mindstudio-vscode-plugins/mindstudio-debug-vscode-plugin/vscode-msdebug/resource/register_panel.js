const { createApp, ref, onMounted, computed, defineComponent } = Vue;
const vscode = acquireVsCodeApi();

const app = Vue.createApp({
    template: `
        <table class="table-panel">
        <thead>
            <tr>
                <td>Type</td>
                <td>Key</td>
                <td>Value</td>
                <td>Code_detail</td>
            </tr>
        </thead>
        <tbody>
            <tr v-for="i in tableData">
                <td class="type">{{ i.type }}</td>
                <td class="key">{{ i.name }}</td>
                <td class="value">{{ i.value }}</td>
                <td class="value detail">{{ i.codeDetail }}</td>
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
