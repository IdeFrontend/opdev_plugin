<script setup>
import { theme } from 'ant-design-vue'
import { ref, computed } from 'vue'
import { message } from "../../untils/Message";
import settingIcon from '../../assets/svg/setting.svg'
import buildIcon from '../../assets/svg/build.svg'
import runIcon from '../../assets/svg/run.svg'

const themeConfig = {
    algorithm: theme.darkAlgorithm
}
const activeConfig = ref('')
const configArray = ref([]);
const selectedKeys = ref([]);
const openKeys = ref(['submenu-build']);

// 菜单配置对象
const menuItems = ref([
    {
        key: 'projectConfig',
        label: '工程配置',
        icon: settingIcon,
        handler: () => {
            message.sendMessageToParent({ command: "vscodeOpenConfig", data: activeConfig.value });
        }
    },
    {
        key: 'build',
        label: '编辑部署',
        icon: buildIcon,
        children: [
            {
                key: 'buildOp',
                label: '编译部署算子',
                handler: () => {
                    message.sendMessageToParent({ command: "vscodeBuildOp", data: '' });
                }
            },
            {
                key: 'basicBuild',
                label: '编译example',
                children: [
                    {
                        key: 'buildExample',
                        label: '基础编译',
                        handler: () => {
                            message.sendMessageToParent({ command: "vscodeBuildExample", data: '' });
                        }
                    }
                ]
            },
        ]
    },
    {
        key: 'runExample',
        label: '运行验证',
        icon: runIcon,
        handler: () => {
            message.sendMessageToParent({ command: "vscodeRunExample", data: '' });
        }
    },
    {
        key: 'projectSH',
        label: '设置环境变量',
        icon: runIcon,
        handler: () => {
            message.sendMessageToParent({ command: "vscodeRunSetProjectSH", data: '' });
        }
    },
]);

// 动态计算顶级子菜单的 key（带前缀）
const rootSubmenuKeys = computed(() => {
    const keys = [];
    menuItems.value.forEach(item => {
        if (item.children && item.children.length > 0) {
            keys.push(`submenu-${item.key}`);
        }
    });
    return keys;
});

// 查找菜单项的处理函数
const findMenuItemHandler = (items, key) => {
    for (const item of items) {
        if (item.key === key && item.handler) {
            return item.handler;
        }
        if (item.children) {
            const handler = findMenuItemHandler(item.children, key);
            if (handler) return handler;
        }
    }
    return null;
}

const handleMenuClick = ({ key }) => {
    // 从带前缀的 key 中提取原始 key
    const originalKey = key.replace(/^(submenu-|menuitem-)/, '');
    selectedKeys.value = [key]; // 使用带前缀的 key 以匹配模板
    const handler = findMenuItemHandler(menuItems.value, originalKey);
    if (handler) {
        handler();
    }
}

const onOpenChange = (keys) => {
    // 直接使用传入的 keys，允许嵌套子菜单正常展开
    openKeys.value = keys;
}
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div class="menu-container">
            <div v-if="false" class="target-box">
                目标算子
                <a-select :value="activeConfig" @change="(val) => activeConfig = val" size="small" style="width: 200px;"
                    placeholder="--">
                    <a-select-option v-for="item in configArray" :key="item.config_name" :value="item.config_name">{{
                        item.config_name }}</a-select-option>
                </a-select>
            </div>

            <a-menu mode="inline" :open-keys="openKeys" :selected-keys="selectedKeys" class="inline-menu"
                @openChange="onOpenChange" @click="handleMenuClick">
                <template v-for="item in menuItems">
                    <!-- 有子菜单的情况 -->
                    <a-sub-menu v-if="item.children && item.children.length > 0" :key="`submenu-${item.key}`">
                        <template #title>
                            <span class="menu-title" v-if="item.icon">
                                <img :src="item.icon" alt="" class="menu-icon">
                                <span>{{ item.label }}</span>
                            </span>
                            <span v-else>{{ item.label }}</span>
                        </template>
                        <template v-for="child in item.children">
                            <!-- 子菜单项 -->
                            <a-menu-item v-if="!child.children || child.children.length === 0"
                                :key="`menuitem-${child.key}`">
                                {{ child.label }}
                            </a-menu-item>
                            <!-- 嵌套子菜单 -->
                            <a-sub-menu v-else :key="`submenu-${child.key}`">
                                <template #title>
                                    <span>{{ child.label }}</span>
                                </template>
                                <a-menu-item v-for="grandChild in child.children" :key="grandChild.key">
                                    {{ grandChild.label }}
                                </a-menu-item>
                            </a-sub-menu>
                        </template>
                    </a-sub-menu>
                    <!-- 普通菜单项 -->
                    <a-menu-item v-else :key="`menuitem-${item.key}`">
                        <span class="menu-title" v-if="item.icon">
                            <img :src="item.icon" alt="" class="menu-icon">
                            <span>{{ item.label }}</span>
                        </span>
                        <span v-else>{{ item.label }}</span>
                    </a-menu-item>
                </template>
            </a-menu>
        </div>
    </a-config-provider>
</template>

<style>
body {
    width: 100% !important;
    height: 100% !important;
    background-color: rgb(20, 20, 20) !important;
}
</style>

<style scoped>
.menu-container {
    padding-top: 12px;
    width: 100%;
}

.target-box {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    margin-bottom: 12px;
}

.inline-menu {
    border-right: none;
    background: transparent;
    margin-left: -20px;
}

:deep(.ant-menu) {
    border-right: none !important;
}

:deep(.ant-menu-item),
:deep(.ant-menu-submenu-title) {
    height: 28px !important;
    line-height: 28px !important;
    margin-block: 2px !important;
}

:deep(.ant-menu-inline) {
    border-right: none !important;
    background-color: rgb(20, 20, 20) !important;
}

:deep(.ant-menu-item-selected) {
    color: rgba(255, 255, 255, 0.85);
    background-color: rgb(20, 20, 20) !important;
}

:deep(.ant-menu-title-content) {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
}

:deep(.ant-menu-submenu-arrow) {
    color: rgba(255, 255, 255, 0.85);
}

.menu-title {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    span {
        color: rgba(255, 255, 255, 0.85);
    }
}

.menu-icon {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    vertical-align: middle;
}

:deep(.ant-menu-item),
:deep(.ant-sub-menu-title) {
    display: flex;
    align-items: center;
    font-size: 11px;
}
</style>
