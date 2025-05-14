const { createApp, ref, onMounted, computed, defineComponent } = Vue;
const vscode = acquireVsCodeApi();

const TableComponent = defineComponent({
    props: ['tableData', 'columnNum', 'address', 'types', 'type'],
    setup(props) {
        function calcColumnNum(index) {
            const findBt = props.types.find(i => i.value === props.type)?.bt || 0;
            const numberType = Number(props.address) + index * findBt;

            return numberType;
        }

        return {
            calcColumnNum
        };
    },
    template: `
        <div class="num-list" :style="{width: 69 * Number(columnNum) + 20 + 'px'}">
            <el-tooltip :effect="dark" 
                :key="index"
                :show-after="100"
                placement="top-start"
                effect="light"
                v-for="(i, index) in tableData">
                <template #content>
                    <div style="color: #c586c0">
                        内存值： {{ i }} <br />
                        内存地址： {{ '0x' + calcColumnNum(index).toString(16).padStart(16 ,'0') }}
                    </div>
                </template>
                <div class="list">{{ i }}</div>
            </el-tooltip>
        </div>
    `,
});

const app = Vue.createApp({
    components: { TableComponent },
    template: `
    <div class="control" v-if="!isError">
        <el-select size="small" :disabled="isCustomStatus" v-model="position" placeholder="请选择内存地址" style="width: 180px">
            <template #prefix>内存位置: </template>
            <el-option
                v-for="item in positions"
                :key="item"
                :label="item"
                :value="item"
                />
        </el-select>
        <el-input size="small"
            v-model="address"
            style="max-width: 280px;"
            placeholder=""
        >
            <template #prepend>内存地址</template>
        </el-input>
        <el-input size="small"
            v-model="size"
            type="number"
            style="max-width: 240px;"
            placeholder=""
        >
            <template #prepend>内存大小(字节)</template>
        </el-input>
        <br />
        <el-select size="small" @change="changeType" v-model="type" placeholder="" style="width: 180px; margin-top: 2px;">
            <template #prefix>数据类型: </template>
            <el-option
                v-for="item in types"
                :key="item.text"
                :label="item.text"
                :value="item.value"
                />
        </el-select>
        <el-input size="small"
            disabled
            v-model="dataCount"
            type="number"
            style="max-width: 280px; margin-top: 2px;"
            placeholder=""
        >
            <template #prepend>数据个数</template>
        </el-input>
        <el-input size="small"
            min="10"
            max="1000"
            type="number"
            v-model="columnNumPre"
            @blur="preCheck"
            @keydown.enter="preCheck"
            style="max-width: 185px; margin-top: 2px;"
            placeholder=""
        >
            <template #prepend>列数</template>
        </el-input>
        <el-button style="margin-top: 2px;" size="small" @click="changeType" type="primary">查询</el-button>
    </div>
    <div class="v-content" v-loading.fullscreen.lock="loading" v-if="!isError">
        <div class="vc-left">
            <div class="l-list" v-for="i in Number(lineNum)">{{ '0x' + calcColumnNum((i - 1) * columnNum).toString(16).padStart(16 ,'0') }}</div>
        </div>
        <div class="vc-right">
            <div class="num-content">
                <div class="num" v-for="i in Number(columnNum)">{{ i }}</div>
            </div>
            <TableComponent :type="type" :address="address" :types="types" :tableData="tableData" :columnNum="columnNum" />
            <el-link style="margin-left: 12px; margin-bottom: 24px" @click="nextPage" type="primary">加载更多...</el-link>
        </div>
    </div>
    <el-result
        v-if="isError"
        icon="warning"
        sub-title="Unsupported variable type."
      >
      </el-result>
    `,
    setup() {
        const isCustomStatus = ref(false);
        const address = ref('0');
        const position = ref('GM');
        const positions = ref(['GM', 'UB', 'L0A', 'L0B', 'L0C', 'L1', 'FB', 'DCACHE']);
        const size = ref('256');
        const type = ref('int64_t[]');
        const types = ref([
            {
                text: 'char',
                value: 'char[]',
                bt: 1,
            },
            {
                text: 'bool',
                value: 'bool',
                bt: 1,
            },
            {
                text: 'int8',
                value: 'int8_t[]',
                bt: 1,
            },
            {
                text: 'uint8',
                value: 'uint8_t[]',
                bt: 1,
            },
            {
                text: 'int16',
                value: 'int16_t[]',
                bt: 2,
            },
            {
                text: 'uint16',
                value: 'uint16_t[]',
                bt: 2,
            },
            {
                text: 'int32',
                value: 'int32_t[]',
                bt: 4,
            },
            {
                text: 'uint32',
                value: 'uint32_t[]',
                bt: 4,
            },
            {
                text: 'int64',
                value: 'int64_t[]',
                bt: 8,
            },
            {
                text: 'uint64',
                value: 'uint64_t[]',
                bt: 8,
            },
            {
                text: 'bfloat16',
                value: 'bfloat16[]',
                bt: 2,
            },
            {
                text: 'float16',
                value: 'float16[]',
                bt: 2,
            },
            {
                text: 'float32',
                value: 'float32[]',
                bt: 4,
            },
            {
                text: 'float64',
                value: 'float64[]',
                bt: 8,
            },
            {
                text: 'uint128',
                value: 'uint128_t[]',
                bt: 16,
            },
        ]);

        const columnNumPre = ref(16);
        const columnNum = ref(16);
        const serverRes = ref({});
        const offset = ref(0);
        const count = ref(2048);
        const tableData = ref([]);
        const loading = ref(false);
        const isError = ref(false);
        const lineNum = computed(() => Math.ceil(tableData.value.length / columnNum.value));
        const dataCount = computed(() => size.value / (types.value.find(i => i.value === type.value)?.bt || 1));
        let req = {};

        if (window.__tableQuery) {
            address.value = window.__tableQuery[3].split('(')[0];
            size.value = Number(window.__tableQuery[4]);
            type.value = 'uint8_t[]';
        }

        function calcColumnNum(index) {
            const findBt = types.value.find(i => i.value === type.value)?.bt || 0;
            const numberType = Number(address.value) + index * findBt;

            return numberType;
        }

        window.addEventListener('message', ({ data }) => {
            req = data;

            if (req.type === 'init') {
                isCustomStatus.value = !!req?.variableName;

                if (isCustomStatus.value) {
                    vscode.postMessage({
                        id: req.id,
                        variableName: req?.variableName,
                        offset: offset.value,
                        count: count.value,
                        memoryReference: {
                            memoryLocation: position.value,
                            address: address.value,
                            dataType: type.value,
                            dataLength: size.value
                        }
                    });

                    loading.value = true;
                }

                if (isCustomStatus.value && window.__tableQuery) {
                    changeType();
                }
            }

            if (req.type === 'result') {
                if (offset.value === 0) {
                    tableData.value = (req.data || []).map(i => i.charCodeAt(0) === 0 ? 'null' : i);
                } else {
                    tableData.value = [...tableData.value, ...(req.data || []).map(i => i.charCodeAt(0) === 0 ? 'null' : i)];
                }

                position.value = req.memoryReference.memoryLocation;
                address.value = req.memoryReference.address;
                type.value = req.memoryReference.dataType;
                size.value = req.memoryReference.dataLength;


                loading.value = false;
            }

            if (req.type === 'error') {
                isError.value = true;
            }
        });

        function query() {
            vscode.postMessage({
                id: req.id,
                variableName: '',
                offset: offset.value,
                count: count.value,
                memoryReference: {
                    memoryLocation: position.value,
                    address: address.value,
                    dataType: type.value,
                    dataLength: size.value
                }
            });

            loading.value = true;
        }

        function changeType() {
            offset.value = 0;

            query();
        }

        function nextPage() {
            offset.value = offset.value + count.value;

            query();
        }

        function preCheck() {
            if (columnNumPre.value < 1) {
                columnNumPre.value = 1;
            } else if (columnNumPre.value > 36) {
                columnNumPre.value = 36;
            }

            columnNum.value = columnNumPre.value;
        }

        return {
            position, address, positions, size, type, dataCount, isCustomStatus, isError,
            types, lineNum, columnNum, req, serverRes, tableData, columnNumPre, loading,
            changeType, query, calcColumnNum, nextPage, preCheck
        };
    }
});

app.use(ElementPlus);
app.mount("#app");
