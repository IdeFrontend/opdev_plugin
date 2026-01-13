<script setup>
import { theme } from 'ant-design-vue';
import {
  ref, onMounted,
} from 'vue';
import settingIcon from '@web/assets/svg/setting.svg';
import buildIcon from '@web/assets/svg/build.svg';
import runIcon from '@web/assets/svg/run.svg';
import shIcon from '@web/assets/svg/sh.svg';
import powerIcon from '@web/assets/svg/power.svg';
import checkIcon from '@web/assets/svg/check.svg';
import {
  startBuild,
  startRun,
  runSanitizer,
  startOnBoard,
  startSimulate,
  stopTask,
  openConfig,
  checkDevtoolConfig,
} from '@web/apis';

const themeConfig = { algorithm: theme.darkAlgorithm };
const activeConfig = ref('');
const configArray = ref([]);
const selectedKeys = ref([]);
const openKeys = ref(['submenu-build']);

// 全局执行状态管理
const isExecuting = ref(false);

// 配置文件是否存在
const hasDevtoolConfig = ref(false);

// 需要互斥的操作按钮（执行时其他按钮应该禁用）
const mutuallyExclusiveKeys = [
  'buildOp',
  'runExample',
  'runCheck',
  'onBoard',
  // 'simulate',
];

// 菜单配置对象
const menuItems = ref([
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
    },
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
        },
      },
      {
        key: 'simulate',
        label: '仿真分析',
        handler: async () => {
          // await startSimulate();
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
]);

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
    if (mutuallyExclusiveKeys.includes(originalKey)) {
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
      if (mutuallyExclusiveKeys.includes(originalKey)) {
        console.log('[Operate] 操作完成，恢复按钮状态');
        isExecuting.value = false;
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

  try {
    await stopTask();
  }
  catch (error) {
    console.error('[Operate] 停止任务失败:', error);
  }
  finally {
    isExecuting.value = false;
  }
};

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
});
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="pt-3 w-full min-w-[138px]">
      <!-- 如果配置文件不存在，显示提示信息 -->
      <div
        v-if="hasDevtoolConfig"
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
                  {{ child.label }}
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
</style>
