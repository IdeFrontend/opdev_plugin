<script setup>
import { theme } from 'ant-design-vue'
import { ref, computed, onMounted } from 'vue'
import settingIcon from '../../assets/svg/setting.svg'
import buildIcon from '../../assets/svg/build.svg'
import runIcon from '../../assets/svg/run.svg'
import shIcon from '../../assets/svg/sh.svg'
import powerIcon from '../../assets/svg/power.svg'
import debugIcon from '../../assets/svg/debug.svg'
import checkIcon from '../../assets/svg/check.svg'
import {
  startBuild,
  startRun,
  runSanitizer,
  startOnBoard,
  startSimulate,
  stopTask,
  openConfig,
  checkDevtoolConfig
} from '@/apis';

const themeConfig = {
    algorithm: theme.darkAlgorithm
}
const activeConfig = ref('')
const configArray = ref([]);
const selectedKeys = ref([]);
const openKeys = ref(['submenu-build']);

// 全局执行状态管理
const isExecuting = ref(false);

// 配置文件是否存在
const hasDevtoolConfig = ref(false);

// 需要互斥的操作按钮（执行时其他按钮应该禁用）
const mutuallyExclusiveKeys = ['buildOp', 'runExample', 'runCheck', 'onBoard', 'simulate'];

// 菜单配置对象
const menuItems = ref([
    {
        key: 'projectConfig',
        label: '工程配置',
        icon: settingIcon,
        handler: async () => {
            await openConfig({ configName: 'huawei-op-devtools.config' });
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
                handler: async () => {
                    await startBuild();
                }
            },
            // {
            //     key: 'basicBuild',
            //     label: '编译example',
            //     children: [
            //         {
            //             key: 'buildExample',
            //             label: '基础编译',
            //             handler: () => {
            //                 message.sendMessageToParent({ command: "vscodeBuildExample", data: '' });
            //             }
            //         }
            //     ]
            // },
        ]
    },
    {
        key: 'runExample',
        label: '运行验证',
        icon: runIcon,
        handler: async () => {
            await startRun();
        }
    },
    // {
    //     key: 'runDebug',
    //     label: '调试',
    //     icon: debugIcon,
    //     children: [
    //         {
    //             key: 'buildAndDebug',
    //             label: '执行调试',
    //             handler: async () => {
    //                 message.sendMessageToParent({ command: "vscodeRunDebug", data: '' });
    //             }
    //         },
    //         {
    //             key: 'debugConfig',
    //             label: '调试配置',
    //             handler: async () => {
    //                 message.sendMessageToParent({ command: "vscodeDebugConfig", data: '' });
    //             }
    //         },
    //     ]
    // },
    {
        key: 'runCheck',
        label: '异常检测',
        icon: checkIcon,
        handler: async () => {
            await runSanitizer();
        }
    },
    {
        key: 'power',
        label: '性能调优',
        icon: powerIcon,
        children: [
            {
                key: 'onBoard',
                label: '上板分析',
                handler: async () => {
                    await startOnBoard();
                }
            },
            {
                key: 'simulate',
                label: '仿真分析',
                handler: async () => {
                    await startSimulate();
                }
            },
        ]
    },
    {
        key: 'projectSH',
        label: '环境配置',
        icon: shIcon,
        handler: async () => {
            await openConfig({ configName: 'huawei-op-devtools.projectSH' });
        }
    },
]);

// 判断菜单项是否应该被禁用
const isMenuItemDisabled = (itemKey) => {
    // 如果当前有操作在执行，且该项是互斥操作，则禁用
    return isExecuting.value && mutuallyExclusiveKeys.includes(itemKey);
};

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

const handleMenuClick = async ({ key }) => {
    const originalKey = key.replace(/^(submenu-|menuitem-)/, '');

    // 检查是否是互斥操作，且当前有操作正在执行
    if (mutuallyExclusiveKeys.includes(originalKey) && isExecuting.value) {
        // 可以选择给用户提示，或者直接忽略点击
        console.warn('有操作正在执行中，请稍后再试');
        return;
    }

    selectedKeys.value = [key]; // 使用带前缀的 key 以匹配模板

    const handler = findMenuItemHandler(menuItems.value, originalKey);
    if (handler) {
        // 如果是互斥操作，设置执行状态
        if (mutuallyExclusiveKeys.includes(originalKey)) {
            console.log('[Operate] 开始执行操作:', originalKey, '，锁定按钮');
            isExecuting.value = true;
        }

        try {
            await handler();
        } catch (error) {
            console.error('[Operate] 执行操作失败:', error);
        } finally {
            // 操作完成后恢复按钮状态
            if (mutuallyExclusiveKeys.includes(originalKey)) {
                console.log('[Operate] 操作完成，恢复按钮状态');
                isExecuting.value = false;
            }
        }
    }
}

const onOpenChange = (keys) => {
    // 直接使用传入的 keys，允许嵌套子菜单正常展开
    openKeys.value = keys;
}

// 监听执行完成的消息
const operationComplete = {
    command: 'iframeOperationComplete',
    callback: (message) => {
        console.log('[Operate] 收到操作完成通知，恢复按钮状态');
        isExecuting.value = false;
    }
}

// 停止任务
const handleStopTask = async () => {
    console.log('[Operate] 用户点击停止任务');
    try {
        await stopTask();
        isExecuting.value = false;
    } catch (error) {
        console.error('[Operate] 停止任务失败:', error);
    }
}

onMounted(async () => {
    // 初始化时检查配置文件是否存在
    try {
        hasDevtoolConfig.value = await checkDevtoolConfig();
        console.log('[Operate] 配置文件检查结果:', hasDevtoolConfig.value);
    } catch (error) {
        console.error('[Operate] 检查配置文件失败:', error);
        hasDevtoolConfig.value = false;
    }
})
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div class="menu-container">
            <!-- 如果配置文件不存在，显示提示信息 -->
            <div v-if="!hasDevtoolConfig" class="empty-tip-container">
                <div class="empty-tip">
                    您需要新建算子工程或打开算子工程才可以使用操作面板
                </div>
            </div>

            <!-- 如果配置文件存在，显示正常菜单 -->
            <template v-else>
                <div v-if="false" class="target-box">
                    目标算子
                    <a-select :value="activeConfig" @change="(val) => activeConfig = val" size="small" style="width: 200px;"
                        placeholder="--">
                        <a-select-option v-for="item in configArray" :key="item.config_name" :value="item.config_name">{{
                            item.config_name }}</a-select-option>
                    </a-select>
                </div>

                <!-- 停止任务按钮 -->
                <div v-if="isExecuting" class="stop-task-container">
                    <a-button danger size="small" @click="handleStopTask" class="stop-task-btn">
                        停止任务
                    </a-button>
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
                                :key="`menuitem-${child.key}`"
                                :disabled="isMenuItemDisabled(child.key)"
                                :class="{ 'menu-item-executing': isMenuItemDisabled(child.key) }">
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
                    <a-menu-item v-else :key="`menuitem-${item.key}`"
                        :disabled="isMenuItemDisabled(item.key)"
                        :class="{ 'menu-item-executing': isMenuItemDisabled(item.key) }">
                        <span class="menu-title" v-if="item.icon">
                            <img :src="item.icon" alt="" class="menu-icon">
                            <span>{{ item.label }}</span>
                        </span>
                        <span v-else>{{ item.label }}</span>
                    </a-menu-item>
                </template>
                </a-menu>
            </template>
        </div>
    </a-config-provider>
</template>

<style>
body {
    width: 100% !important;
    height: 100% !important;
    background-color: #262729 !important;
    padding: 0px;
}
</style>

<style scoped>
.menu-container {
    padding-top: 12px;
    width: 100%;
    min-width: 138px;
}

.target-box {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    margin-bottom: 12px;
}

.stop-task-container {
    padding: 8px 12px;
    margin-bottom: 8px;
}

.stop-task-btn {
    width: 100%;
    font-size: 11px;
    height: 24px;
}

.inline-menu {
    border-right: none;
    background: transparent;
    margin-left: -12px;
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
    background-color: #262729 !important;
}

:deep(.ant-menu-item-selected) {
    color: rgba(255, 255, 255, 0.85);
    background-color: #262729 !important;
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

/* 禁用状态的样式 */
:deep(.ant-menu-item-disabled) {
    opacity: 0.5;
    cursor: not-allowed !important;
}

.menu-item-executing {
    pointer-events: none;
}

.empty-tip-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 20px;
}

.empty-tip {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
    text-align: center;
    line-height: 1.6;
}
</style>
