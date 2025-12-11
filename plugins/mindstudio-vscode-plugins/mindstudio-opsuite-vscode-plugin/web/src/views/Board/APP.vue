<script setup>
import { SettingOutlined, DownOutlined } from '@ant-design/icons-vue'
import { theme } from 'ant-design-vue'
import { ref, onMounted } from 'vue'
import { message } from "../../untils/Message";

const themeConfig = {
    algorithm: theme.darkAlgorithm
}
const activeConfig = ref('')

const buildOpFn = () => {
    const curBuildConfigData = buildConfigData[activeConfig.value].find(
        (v) => v.config_type === "build_op"
    );
    const id = curBuildConfigData.config_id;
    message.sendMessageToParent({ command: "vscodeBuildOp", data: id });
}

const buildExampleFn = () => {
    const exampleConfigData = buildConfigData[activeConfig.value].find(
        (v) => v.config_type === "build_example"
    );
    const id = exampleConfigData.config_id;
    message.sendMessageToParent({
        command: "vscodeBuildExample",
        data: id,
    });
};

const configArray = ref([]);
const buildConfigData = JSON.parse(localStorage.getItem("buildConfig") || '{}');
console.log('---------------buildConfigDataBoard', buildConfigData)
configArray.value = Object.keys(buildConfigData).map((config_name) => {
    return { config_name };
});

if (configArray.value.length > 0) {
    activeConfig.value = configArray.value[0].config_name;
    if (activeConfig.value) {
        message.sendMessageToParent({
            command: "vscodeSetActiveConfig",
            data: activeConfig.value
        });
    }
}

const clickSetting = (() => {
    if (!activeConfig.value) {
        console.log('未获取到configArray')
        return
    }
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
                                <a-menu-item>带debug选项的编译</a-menu-item>
                                <a-menu-item>带sanitizer选项的编译</a-menu-item>
                            </a-sub-menu>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-dropdown>
                    <span class="dropdown-content">
                        <img src="../../assets/svg/run.svg" alt="" class="img">
                        运行
                        <DownOutlined style="margin-right: 4px; margin-left: 4px;" />
                    </span>
                    <template #overlay>
                        <a-menu>
                            <a-menu-item>运行算子</a-menu-item>
                            <a-menu-item>运行example</a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-dropdown>
                    <span class="dropdown-content">
                        <img src="../../assets/svg/debug.svg" alt="" class="img">
                        调试
                        <DownOutlined style="margin-right: 4px; margin-left: 4px;" />
                    </span>
                    <template #overlay>
                        <a-menu>
                            <a-menu-item>执行调试</a-menu-item>
                            <a-menu-item>调试配置</a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>
            </div>


            <div style="padding-top: 12px;">
                <a-button type="text" size="small" style="padding: 0;">
                    <div class="inline-flex">
                        <img src="../../assets/svg/check.svg" alt="" class="img">
                        异常检测
                    </div>
                </a-button>

                <a-dropdown>
                    <span class="dropdown-content" style="margin-left: 4px">
                        <img src="../../assets/svg/power.svg" alt="" class="img">
                        性能调优
                        <DownOutlined style="margin-right: 4px; margin-left: 4px;" />
                    </span>
                    <template #overlay>
                        <a-menu>
                            <a-menu-item>带源码的性能调优</a-menu-item>
                            <a-menu-item>不带源码的性能调优</a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-button type="text" size="small" style="padding: 0;" @click="clickSetting">
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
    margin-right: 8px;
}

.img {
    width: 16px;
    height: 16px;
    margin-right: 4px;
}

.dropdown-content {
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    margin-right: 8px;
}
</style>