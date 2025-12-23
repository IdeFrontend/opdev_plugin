<script setup>
import { SettingOutlined, DownOutlined } from '@ant-design/icons-vue'
import { theme } from 'ant-design-vue'
import { ref, onMounted } from 'vue'
import { message } from "../../untils/Message";

const themeConfig = {
    algorithm: theme.darkAlgorithm
}
const activeConfig = ref('')
const configArray = ref([]);

const buildOpFn = () => {
    message.sendMessageToParent({ command: "vscodeBuildOp", data: '' });
}

const buildExampleFn = () => {
    message.sendMessageToParent({
        command: "vscodeBuildExample",
        data: '',
    });
};

const runExampleFn = () => {
    message.sendMessageToParent({
        command: "vscodeRunExample",
        data: '',
    });
};

const clickSetting = (() => {
    message.sendMessageToParent({
        command: "vscodeOpenConfig",
        data: activeConfig.value
    });
})
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div>
            <div v-if="false" class="target-box">
                目标算子
                <a-select v-model:value="activeConfig" size="small" style="width: 200px;" placeholder="--">
                    <a-select-option v-for="item in configArray" :key="item.config_name" :value="item.config_name">{{
                        item.config_name }}</a-select-option>
                </a-select>
                <a-button type="text" size="small">
                    <SettingOutlined @click="clickSetting" />
                </a-button>
            </div>

            <div style="padding-top: 12px;">
                <a-dropdown>
                    <span class="dropdown-content">
                        <img src="../../assets/svg/build.svg" alt="" class="img">
                        编译部署
                        <DownOutlined style="margin-right: 4px; margin-left: 4px;" />
                    </span>
                    <template #overlay>
                        <a-menu>
                            <a-menu-item @click="buildOpFn">编译部署算子</a-menu-item>
                            <a-sub-menu key="sub1" title="编译example">
                                <a-menu-item @click="buildExampleFn">基础编译</a-menu-item>
                            </a-sub-menu>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-button type="text" size="small" style="margin-right: 4px;" @click="runExampleFn">
                    <div class="inline-flex">
                        <img src="../../assets/svg/run.svg" alt="" class="img">
                        运行验证
                    </div>
                </a-button>

                <a-button type="text" size="small" style="margin-right: 4px;" @click="clickSetting">
                    <div class="inline-flex">
                        <img src="../../assets/svg/setting.svg" alt="" class="img">
                        工程配置
                    </div>
                </a-button>
            </div>
        </div>
    </a-config-provider>
</template>

<style scoped>
.target-box {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
}

.inline-flex {
    font-size: 14px;
    display: inline-flex;
    align-items: center;
}

.img {
    width: 16px;
    height: 16px;
    margin-right: 4px;
}

.dropdown-content {
    height: 24px;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    margin-right: 7px;
    margin-left: 7px;
}
</style>