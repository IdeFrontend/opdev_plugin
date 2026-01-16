<script setup>
import { theme } from 'ant-design-vue';
import {
  ref, computed, onMounted, onUnmounted
} from 'vue';
import settingIcon from '@web/assets/svg/setting.svg';
import buildIcon from '@web/assets/svg/build.svg';
import runIcon from '@web/assets/svg/run.svg';
import shIcon from '@web/assets/svg/sh.svg';
import powerIcon from '@web/assets/svg/power.svg';
import debugIcon from '@web/assets/svg/debug.svg';
import checkIcon from '@web/assets/svg/check.svg';
import {
  startBuild,
  startRun,
  stopTask,
  openConfig,
  checkDevtoolConfig,
  checkTaskStatus,
  getDebugMode,
  runDebug,
  debugConfig,
  runCpuDebug,
  cpuDebugConfig,
  navigateToTab
} from '@web/apis';
import { SettingOutlined } from '@ant-design/icons-vue';

const themeConfig = { algorithm: theme.darkAlgorithm };
const activeConfig = ref('');
const configArray = ref([]);
const selectedKeys = ref([]);
const openKeys = ref(['submenu-build']);

// 全局执行状态管理
const isExecuting = ref(false);
// 是否正在停止任务
const isStopping = ref(false);

// 配置文件是否存在
const hasDevtoolConfig = ref(false);

// 调试模式开关
const debugModeEnabled = ref(false);

// 需要互斥的操作按钮（执行时其他按钮应该禁用）
const mutuallyExclusiveKeys = [
  'buildOp',
  'runExample',
  'sanitizer',
  'onboard',
  'simulation',
];

// 基础菜单配置（不包含调试菜单）
const baseMenuItems = [
  {
    key: 'projectConfig',
    label: '工程配置',
    icon: settingIcon,
    handler: async () => {
      await openConfig({ configName: 'huawei-op-devtools.config' });
    },
  },
  {
    key: 'build',
    label: '编译部署',
    icon: buildIcon,
    children: [
      {
        key: 'buildOp',
        label: '编译部署算子',
        handler: async () => {
          await startBuild();
        },
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
    ],
  },
  {
    key: 'runExample',
    label: '运行验证',
    icon: runIcon,
    handler: async () => {
      await startRun();
    },
  },
  {
    key: 'sanitizer',
    label: '异常检测',
    icon: checkIcon,
    handler: async () => {
      await openConfig({ configName: 'huawei-op-devtools.sanitizerOptions' });
    },
  },
  {
    key: 'power',
    label: '性能调优',
    icon: powerIcon,
    children: [
      {
        key: 'onboard',
        label: '上板分析',
        handler: async () => {
          await openConfig({ configName: 'huawei-op-devtools.onBoardOptions' });
        },
      },
      {
        key: 'simulation',
        label: '仿真分析',
        handler: async () => {
          await openConfig({ configName: 'huawei-op-devtools.simulatorOptions' });
        },
      },
    ],
  },
  {
    key: 'projectSH',
    label: '环境配置',
    icon: shIcon,
    handler: async () => {
      await openConfig({ configName: 'huawei-op-devtools.projectSH' });
    },
  },
];

// 调试菜单配置（只在调试模式启用时显示）
const debugMenuItem = {
  key: 'runDebug',
  label: '调试',
  icon: debugIcon,
  children: [
    {
      key: 'buildAndDebug',
      label: 'NPU调试',
      handler: async () => {
        await runDebug();
      },
    },
    {
      key: 'debugConfig',
      label: 'NPU调试配置',
      handler: async () => {
        await debugConfig();
      },
    },
    {
      key: 'buildAndCpuDebug',
      label: 'CPU调试',
      handler: async () => {
        await runCpuDebug();
      },
    },
    {
      key: 'cpuDebugConfig',
      label: 'CPU调试配置',
      handler: async () => {
        await cpuDebugConfig();
      },
    },
  ],
};

// 动态计算菜单项（根据调试模式开关决定是否包含调试菜单）
const menuItems = computed(() => {
  const items = [...baseMenuItems];

  // 如果启用了调试模式，在"运行验证"后插入调试菜单
  if (debugModeEnabled.value) {
    const runExampleIndex = items.findIndex(item => item.key === 'runExample');
    if (runExampleIndex !== -1) {
      items.splice(runExampleIndex + 1, 0, debugMenuItem);
    }
  }

  return items;
});

// 判断菜单项是否应该被禁用
const isMenuItemDisabled = (itemKey) => {
  // 如果当前有操作在执行，且该项是互斥操作，则禁用
  return isExecuting.value && mutuallyExclusiveKeys.includes(itemKey);
};

// 查找菜单项的处理函数
const findMenuItemHandler = (items, key) => {
  for (const item of items) {
    if (item.key === key && item.handler) {
      return item.handler;
    }

    if (item.children) {
      const handler = findMenuItemHandler(item.children, key);

      if (handler) {
        return handler;
      }
    }
  }

  return null;
};

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
    if (['buildOp', 'runExample'].includes(originalKey)) {
      console.log('[Operate] 开始执行操作:', originalKey, '，锁定按钮');
      isExecuting.value = true;
    }

    try {
      await handler();
    }
    catch (error) {
      console.error('[Operate] 执行操作失败:', error);
    }
    finally {
      // 操作完成后恢复按钮状态
      if (['buildOp', 'runExample'].includes(originalKey)) {
        // 如果任务正在被停止，延迟清除执行状态，确保停止任务按钮不会过早消失
        if (isStopping.value) {
          console.log('[Operate] 任务正在被停止，延迟清除执行状态');
          // 等待足够长的时间，确保任务真正停止
          // 后端 cleanup() 最多等待5秒，但实际进程停止可能需要更长时间
          // 特别是对于长时间运行的任务（如编译），需要更多时间让进程完全停止
          setTimeout(() => {
            console.log('[Operate] 延迟后恢复按钮状态');
            isExecuting.value = false;
            isStopping.value = false;
          }, 10000); // 延迟10秒，确保任务真正停止（给进程足够时间完全停止）
        }
        else {
          console.log('[Operate] 操作完成，恢复按钮状态');
          isExecuting.value = false;
        }
      }
    }
  }
};

const onOpenChange = (keys) => {
  // 直接使用传入的 keys，允许嵌套子菜单正常展开
  openKeys.value = keys;
};

// 停止任务
const handleStopTask = async () => {
  console.log('[Operate] 用户点击停止任务');
  isStopping.value = true; // 标记正在停止任务

  try {
    await stopTask();
    // 停止任务请求发送成功，等待任务真正停止
    // isExecuting 会在任务完成后自动设置为 false（在 handleMenuClick 的 finally 块中）
  }
  catch (error) {
    console.error('[Operate] 停止任务失败:', error);
    // 如果停止任务失败，取消停止标记，但不立即清除执行状态
    // 让任务自然完成后在 handleMenuClick 的 finally 中清除
    isStopping.value = false;
  }
};

let statusTimer = null;

onMounted(async () => {
  // 初始化时检查配置文件是否存在
  try {
    hasDevtoolConfig.value = await checkDevtoolConfig();
    console.log('[Operate] 配置文件检查结果:', hasDevtoolConfig.value);
  }
  catch (error) {
    console.error('[Operate] 检查配置文件失败:', error);
    hasDevtoolConfig.value = false;
  }

  // 获取调试模式开关状态
  try {
    debugModeEnabled.value = await getDebugMode();
    console.log('[Operate] 调试模式状态:', debugModeEnabled.value);
  }
  catch (error) {
    console.error('[Operate] 获取调试模式状态失败:', error);
    debugModeEnabled.value = true; // 默认开启
  }

  // 开启状态同步定时器
  statusTimer = setInterval(async () => {
    try {
      const isRunning = await checkTaskStatus();
      // 只有当状态发生变化时才更新，避免不必要的重绘
      if (isExecuting.value !== isRunning) {
        console.log('[Operate] 同步后端任务状态:', isRunning);
        isExecuting.value = isRunning;
      }
    }
    catch (error) {
      console.error('[Operate] 获取任务状态失败:', error);
    }
  }, 1000);
});

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
});


const openSetting = async (key) => {
  const configKey = key === 'simulation' || key === 'onboard' ? `opprof-${key}` : key;

  // 首先尝试打开配置页面
  await openConfig({ configName: 'huawei-op-devtools.config', key: configKey });

  // 然后向已打开的配置页面发送导航消息
  try {
    await navigateToTab(configKey);
  } catch (error) {
    console.error('导航到标签页失败:', error);
  }
}
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="pt-3 w-full min-w-[138px]">
      <!-- 如果配置文件不存在，显示提示信息 -->
      <div
        v-if="!hasDevtoolConfig"
        class="flex items-center justify-center min-h-[200px] p-5"
      >
        <div class="text-xs text-white/65 text-center leading-relaxed">
          您需要新建算子工程或打开算子工程才可以使用操作面板
        </div>
      </div>

      <!-- 如果配置文件存在，显示正常菜单 -->
      <template v-else>
        <div
          v-if="false"
          class="text-sm flex items-center gap-2 mt-3 mb-3"
        >
          目标算子
          <a-select
            :value="activeConfig"
            size="small"
            style="width: 200px"
            placeholder="--"
            @change="(val) => (activeConfig = val)"
          >
            <a-select-option
              v-for="item in configArray"
              :key="item.config_name"
              :value="item.config_name"
            >
              {{ item.config_name }}
            </a-select-option>
          </a-select>
        </div>

        <!-- 停止任务按钮 -->
        <div
          v-if="isExecuting"
          class="px-3 py-2 mb-2"
        >
          <a-button
            danger
            size="small"
            class="w-full text-[11px] h-6"
            @click="handleStopTask"
          >
            停止任务
          </a-button>
        </div>

        <a-menu
          mode="inline"
          :open-keys="openKeys"
          :selected-keys="selectedKeys"
          class="border-r-0 bg-transparent -ml-3"
          @open-change="onOpenChange"
          @click="handleMenuClick"
        >
          <template v-for="item in menuItems">
            <!-- 有子菜单的情况 -->
            <a-sub-menu
              v-if="item.children && item.children.length > 0"
              :key="`submenu-${item.key}`"
            >
              <template #title>
                <span
                  v-if="item.icon"
                  class="inline-flex items-center text-[11px]"
                >
                  <img
                    :src="item.icon"
                    alt=""
                    class="w-4 h-4 mr-2 align-middle"
                  />
                  <span class="text-white/85">{{ item.label }}</span>
                </span>
                <span
                  v-else
                  class="text-white/85"
                >{{ item.label }}</span>
              </template>
              <template v-for="child in item.children">
                <!-- 子菜单项 -->
                <a-menu-item
                  v-if="!child.children || child.children.length === 0"
                  :key="`menuitem-${child.key}`"
                  :disabled="isMenuItemDisabled(child.key)"
                  :class="{
                    'opacity-50 cursor-not-allowed':
                      isMenuItemDisabled(child.key),
                  }"
                >
                  <div class="single-box">
                    {{ child.label }}
                    <div v-if="child.key === 'simulation' || child.key === 'onboard'" class="setting-box">
                      <SettingOutlined @click.stop="openSetting(child.key)" />
                    </div>
                  </div>
                </a-menu-item>
                <!-- 嵌套子菜单 -->
                <a-sub-menu
                  v-else
                  :key="`submenu-${child.key}`"
                >
                  <template #title>
                    <span>{{ child.label }}</span>
                  </template>
                  <a-menu-item
                    v-for="grandChild in child.children"
                    :key="grandChild.key"
                  >
                    {{ grandChild.label }}
                  </a-menu-item>
                </a-sub-menu>
              </template>
            </a-sub-menu>
            <!-- 普通菜单项 -->
            <a-menu-item
              v-else
              :key="`menuitem-${item.key}`"
              :disabled="isMenuItemDisabled(item.key)"
              :class="{
                'opacity-50 cursor-not-allowed':
                  isMenuItemDisabled(item.key),
              }"
            >
              <div v-if="item.icon" class="single-box"> 
                <span class="inline-flex items-center text-[11px]">
                  <img
                    :src="item.icon"
                    alt=""
                    class="w-4 h-4 mr-2 align-middle"
                  />
                  <span class="text-white/85">{{ item.label }}</span>
                </span>
                <div v-if="item.key === 'sanitizer'" class="setting-box">
                  <SettingOutlined @click.stop="openSetting(item.key)" />
                </div>
              </div>
              <span
                v-else
                class="text-white/85"
              >{{ item.label }}</span>
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

<style scoped lang="less">
/* Ant Menu Overrides */
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

:deep(.ant-menu-item),
:deep(.ant-sub-menu-title) {
  display: flex;
  align-items: center;
  font-size: 11px;
}

:deep(.ant-menu-item-disabled) {
  opacity: 0.5;
  cursor: not-allowed !important;
}

.single-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.single-box:hover .setting-box {
  display: flex;
}

.setting-box {
  display: none;
  width: 22px;
  height: 22px;
  justify-content: center;
  align-items: center;
  border-radius: 6px;
  cursor: pointer !important;
}
.setting-box:hover {
  background-color: #262729 !important;
}
</style>
