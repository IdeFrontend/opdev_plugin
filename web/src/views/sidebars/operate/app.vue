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
  navigateToTab,
  checkMultipleOperators,
  getProjectType,
} from '@web/apis';
import { SettingOutlined, CheckOutlined } from '@ant-design/icons-vue';

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

// 当前项目类型
const projectTypeName = ref('');
const projectType = ref('');  // 项目类型  'cann' | 'ascend' | 'pyasc'
const projectTemplateName = ref(''); // 项目子类型  'hello_world' | 'addn_custom' | 'torch_library_template'

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
      {
        key: 'buildExample',
        label: '编译example',
        handler: async () => { },
      },
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
      key: 'buildAndCpuDebug',
      label: 'CPU调试',
      handler: async () => {
        await runCpuDebug();
      },
    },
    {
      key: 'buildAndDebug',
      label: 'NPU调试',
      handler: async () => {
        await runDebug();
      },
    },
    {
      key: 'cpuDebugConfig',
      label: 'CPU调试配置',
      handler: async () => {
        await cpuDebugConfig();
      },
    },
    {
      key: 'debugConfig',
      label: 'NPU调试配置',
      handler: async () => {
        await debugConfig();
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

  // 如果项目类型是 pyasc，隐藏编译部署、调试、异常检测
  if (projectType.value === 'pyasc') {
    return items.filter(item => 
      item.key !== 'build' && 
      item.key !== 'sanitizer' && 
      item.key !== 'runDebug'
    );
  }

  // 过滤菜单项：buildExample 只在标准自定义算子中显示
  return items.map(item => {
    if (item.key === 'build' && item.children) {
      return {
        ...item,
        children: item.children.filter(child => {
          // buildExample 只在标准自定义算子中显示
          if (child.key === 'buildExample') {
            return isStandardCustom.value;
          }
          return true;
        }),
      };
    }
    return item;
  });
>>>>>>> vscode_plugin
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

  // 获取当前项目类型
  try {
    const result = await getProjectType();
    projectTypeName.value = result.projectTypeName || '未知';
    projectType.value = result.projectType || '';
    projectTemplateName.value = result.projectTemplateName || '';
    console.log('[Operate] 当前项目类型:', JSON.stringify(result));
  }
  catch (error) {
    console.error('[Operate] 获取项目类型失败:', error);
    projectTypeName.value = '未知';
  }

  // 检查是否有多个算子工程
  try {
    const result = await checkMultipleOperators();
    hasMultipleOperators.value = result.hasMultiple || false;
    isStandardCustom.value = result.isStandardCustom || false;
    console.log('[Operate] 是否有多个算子工程:', hasMultipleOperators.value);
    console.log('[Operate] 是否是标准自定义算子:', isStandardCustom.value);

    // 如果是标准自定义算子，即使没有配置文件，也应该显示操作面板
    if (isStandardCustom.value) {
      hasDevtoolConfig.value = true;
      console.log('[Operate] 标准自定义算子，强制显示操作面板');
    }

    // 如果是标准自定义算子，更新算子列表
    if (result.isStandardCustom && result.operators) {
      // 清空模拟数据
      compiledOperators.value = [];
      preparedOperators.value = [];

      // 根据是否experimental分类，并判断是否编译成功
      result.operators.forEach((op) => {
        const operatorItem = {
          id: String(op.id),
          name: op.name,
          hasEx: op.isExperimental,
        };

        // 默认所有算子都放到预备算子工程中
        // 根据编译成功判断逻辑，将编译成功的算子移到编译成功的算子工程列表中
        if (isOperatorCompiled(operatorItem)) {
          compiledOperators.value.push(operatorItem);
        } else {
          preparedOperators.value.push(operatorItem);
        }
      });

      // 同时更新 configArray，用于选择器显示
      // experimental 算子的名称后面加上 "ex"
      configArray.value = result.operators.map((op) => ({
        config_name: op.isExperimental ? `${op.name}ex` : op.name,
        id: op.id,
        name: op.name,
        isExperimental: op.isExperimental,
      }));

      console.log('[Operate] 标准自定义算子，编译成功的算子列表:', compiledOperators.value);
      console.log('[Operate] 标准自定义算子，预备算子列表:', preparedOperators.value);
      console.log('[Operate] 标准自定义算子，加载配置列表:', configArray.value);
    }
  }
  catch (error) {
    console.error('[Operate] 检查多个算子工程失败:', error);
    hasMultipleOperators.value = false;
    isStandardCustom.value = false;
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
};

// 算子工程选择器相关状态
const hasMultipleOperators = ref(false);
const isStandardCustom = ref(false); // 是否是标准自定义算子
const operatorSelectorVisible = ref(false);
const searchKeyword = ref('');
const selectedOperatorIds = ref([]);
const compiledOperatorsActiveKey = ref(['1']);
const preparedOperatorsActiveKey = ref(['1']);
const operatorSelectorTriggerRef = ref(null);
const popoverWidth = ref('auto');

// 判断算子是否编译成功（待实现具体判断逻辑）
// eslint-disable-next-line no-unused-vars
const isOperatorCompiled = (operator) => {
  // TODO: 实现编译成功的判断逻辑
  // 目前默认返回 false，所有算子都放到预备算子工程中
  return false;
};

// 编译成功的算子工程（通过 isOperatorCompiled 判断）
const compiledOperators = ref([]);

// 预备算子工程（默认所有算子都在这里）
const preparedOperators = ref([]);

// 所有算子工程（合并两个列表）
const allOperators = computed(() => [
  ...compiledOperators.value,
  ...preparedOperators.value,
]);

// 根据搜索关键词过滤算子工程
const filteredCompiledOperators = computed(() => {
  if (!searchKeyword.value.trim()) {
    return compiledOperators.value;
  }

  const keyword = searchKeyword.value.toLowerCase();

  return compiledOperators.value.filter((op) =>
    op.name.toLowerCase().includes(keyword),
  );
});

const filteredPreparedOperators = computed(() => {
  if (!searchKeyword.value.trim()) {
    return preparedOperators.value;
  }

  const keyword = searchKeyword.value.toLowerCase();

  return preparedOperators.value.filter((op) =>
    op.name.toLowerCase().includes(keyword),
  );
});

// 获取已选择的算子工程
const selectedOperators = computed(() => {
  return allOperators.value.filter((op) => selectedOperatorIds.value.includes(op.id));
});

// 获取已选择项的类型（ex 或 无ex）
const selectedType = computed(() => {
  if (selectedOperators.value.length === 0) {
    return null; // 没有选择任何项
  }

  const hasEx = selectedOperators.value.some((op) => op.hasEx);
  const hasNonEx = selectedOperators.value.some((op) => !op.hasEx);

  if (hasEx && !hasNonEx) {
    return 'ex'; // 只选择了带ex的
  }

  if (!hasEx && hasNonEx) {
    return 'nonEx'; // 只选择了不带ex的
  }

  return null; // 理论上不应该出现这种情况
});

// 检查条目是否应该被禁用
const isOperatorDisabled = (operator) => {
  if (selectedType.value === null) {
    return false; // 没有选择任何项，不禁用
  }

  // 如果已选择的是带ex的，则不带ex的应该被禁用
  if (selectedType.value === 'ex' && !operator.hasEx) {
    return true;
  }

  // 如果已选择的是不带ex的，则带ex的应该被禁用
  if (selectedType.value === 'nonEx' && operator.hasEx) {
    return true;
  }

  return false;
};

// 检查全选是否应该禁用（编译成功的算子工程）
const isCompiledAllDisabled = computed(() => {
  return selectedType.value === null;
});

// 检查全选是否应该禁用（预备算子工程）
const isPreparedAllDisabled = computed(() => {
  return selectedType.value === null;
});

// 检查是否全选（编译成功的算子工程）
const isCompiledAllSelected = computed(() => {
  if (selectedType.value === null) {
    return false;
  }

  const filtered = filteredCompiledOperators.value;
  const targetType = selectedType.value === 'ex';

  // 只检查目标类型的项
  const targetItems = filtered.filter((op) => op.hasEx === targetType);

  return targetItems.length > 0 && targetItems.every((op) => selectedOperatorIds.value.includes(op.id));
});

// 检查是否全选（预备算子工程）
const isPreparedAllSelected = computed(() => {
  if (selectedType.value === null) {
    return false;
  }

  const filtered = filteredPreparedOperators.value;
  const targetType = selectedType.value === 'ex';

  // 只检查目标类型的项
  const targetItems = filtered.filter((op) => op.hasEx === targetType);

  return targetItems.length > 0 && targetItems.every((op) => selectedOperatorIds.value.includes(op.id));
});

// 切换单个算子工程的选择状态
const toggleOperator = (operator) => {
  const isSelected = selectedOperatorIds.value.includes(operator.id);

  if (isSelected) {
    // 取消选择
    selectedOperatorIds.value = selectedOperatorIds.value.filter((id) => id !== operator.id);
  } else {
    // 检查是否违反规则：不能同时选择带ex和不带ex的条目
    const selectedOps = selectedOperators.value;

    if (selectedOps.length > 0) {
      const hasExInSelected = selectedOps.some((op) => op.hasEx);
      const hasNonExInSelected = selectedOps.some((op) => !op.hasEx);

      // 如果当前要选择的是带ex的，但已选择中有不带ex的，则不允许
      if (operator.hasEx && hasNonExInSelected) {
        return;
      }

      // 如果当前要选择的是不带ex的，但已选择中有带ex的，则不允许
      if (!operator.hasEx && hasExInSelected) {
        return;
      }
    }

    // 允许选择
    selectedOperatorIds.value.push(operator.id);
  }
};

// 切换全选（编译成功的算子工程）
const toggleCompiledAll = () => {
  if (selectedType.value === null) {
    return; // 没有选择任何项，全选禁用
  }

  const filtered = filteredCompiledOperators.value;

  if (filtered.length === 0) {
    return;
  }

  const targetType = selectedType.value === 'ex';
  const targetItems = filtered.filter((op) => op.hasEx === targetType);

  if (isCompiledAllSelected.value) {
    // 取消全选 - 只取消目标类型的项
    selectedOperatorIds.value = selectedOperatorIds.value.filter((id) =>
      !targetItems.some((op) => op.id === id),
    );
  } else {
    // 全选目标类型的项
    targetItems.forEach((op) => {
      if (!selectedOperatorIds.value.includes(op.id)) {
        selectedOperatorIds.value.push(op.id);
      }
    });
  }
};

// 切换全选（预备算子工程）
const togglePreparedAll = () => {
  if (selectedType.value === null) {
    return; // 没有选择任何项，全选禁用
  }

  const filtered = filteredPreparedOperators.value;

  if (filtered.length === 0) {
    return;
  }

  const targetType = selectedType.value === 'ex';
  const targetItems = filtered.filter((op) => op.hasEx === targetType);

  if (isPreparedAllSelected.value) {
    // 取消全选 - 只取消目标类型的项
    selectedOperatorIds.value = selectedOperatorIds.value.filter((id) =>
      !targetItems.some((op) => op.id === id),
    );
  } else {
    // 全选目标类型的项
    targetItems.forEach((op) => {
      if (!selectedOperatorIds.value.includes(op.id)) {
        selectedOperatorIds.value.push(op.id);
      }
    });
  }
};

// 移除已选择的算子工程
const removeOperator = (operatorId) => {
  selectedOperatorIds.value = selectedOperatorIds.value.filter((id) => id !== operatorId);
};

// 处理 Popover 打开/关闭事件，动态设置宽度
const handlePopoverOpenChange = (open) => {
  if (open && operatorSelectorTriggerRef.value) {
    // 当 Popover 打开时，获取触发器的宽度
    const triggerWidth = operatorSelectorTriggerRef.value.offsetWidth;
    popoverWidth.value = `${triggerWidth}px`;
  }
};
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <div class="pt-3 w-full min-w-[138px]">
      <!-- 如果配置文件不存在且不是标准自定义算子，显示提示信息 -->
      <div v-if="!hasDevtoolConfig && !isStandardCustom" class="flex items-center justify-center min-h-[200px] p-5">
        <div class="text-xs text-white/65 text-center leading-relaxed">
          您需要新建算子工程或打开算子工程才可以使用操作面板
        </div>
      </div>

      <!-- 如果配置文件存在或是标准自定义算子，显示正常菜单 -->
      <template v-else>

        <!-- 停止任务按钮 -->
        <div v-if="isExecuting" class="px-3 py-2 mb-2">
          <a-button danger size="small" class="w-full text-[11px] h-6" @click="handleStopTask">
            停止任务
          </a-button>
        </div>

        <!-- 算子工程选择器 -->
        <div v-if="hasMultipleOperators || isStandardCustom" class="px-3 py-2 mb-2 operator-selector-wrapper">
          <a-popover v-model:open="operatorSelectorVisible" placement="bottomLeft" trigger="click"
            :overlay-style="{ width: popoverWidth, padding: '0' }" overlay-class-name="operator-selector-popover"
            @open-change="handlePopoverOpenChange">
            <template #content>
              <div class="operator-selector-content">
                <!-- 第一个模块：已选择的内容 -->
                <div class="selected-section">
                  <div class="selected-header">
                    已选择 {{ selectedOperators.length }} 项
                  </div>
                  <div class="selected-tags">
                    <a-tag v-for="op in selectedOperators" :key="op.id" closable class="mb-2 mr-2"
                      @close="removeOperator(op.id)">
                      {{ op.name }}
                    </a-tag>
                  </div>
                  <div class="divider" />
                </div>

                <!-- 第二个模块：搜索和选择 -->
                <div class="search-section">
                  <a-input v-model:value="searchKeyword" placeholder="搜索算子工程" class="mb-3" allow-clear />

                  <!-- 编译成功的算子工程 -->
                  <a-collapse v-model:active-key="compiledOperatorsActiveKey"
                    :bordered="false" class="operator-collapse">
                    <a-collapse-panel key="1" header="编译成功的算子工程">
                      <div class="operator-list">
                        <div class="operator-item select-all" :class="{
                          selected: isCompiledAllSelected,
                          disabled: isCompiledAllDisabled,
                        }" @click="!isCompiledAllDisabled && toggleCompiledAll()">
                          <span>全选</span>
                          <CheckOutlined v-if="isCompiledAllSelected" class="check-icon" />
                        </div>
                        <div v-for="op in filteredCompiledOperators" :key="op.id" class="operator-item" :class="{
                          selected: selectedOperatorIds.includes(op.id),
                          disabled: isOperatorDisabled(op),
                        }" @click="!isOperatorDisabled(op) && toggleOperator(op)">
                          <span>
                            {{ op.name }}
                            <div v-if="op.hasEx" class="ex-icon">
                              ex
                            </div>
                          </span>
                          <CheckOutlined v-if="selectedOperatorIds.includes(op.id)" class="check-icon" />
                        </div>
                      </div>
                    </a-collapse-panel>
                  </a-collapse>

                  <!-- 预备算子工程 -->
                  <a-collapse v-model:active-key="preparedOperatorsActiveKey" :bordered="false"
                    class="operator-collapse mt-3">
                    <a-collapse-panel key="1" header="预备算子工程">
                      <div class="operator-list">
                        <div class="operator-item select-all" :class="{
                          selected: isPreparedAllSelected,
                          disabled: isPreparedAllDisabled,
                        }" @click="!isPreparedAllDisabled && togglePreparedAll()">
                          <span>全选</span>
                          <CheckOutlined v-if="isPreparedAllSelected" class="check-icon" />
                        </div>
                        <div v-for="op in filteredPreparedOperators" :key="op.id" class="operator-item" :class="{
                          selected: selectedOperatorIds.includes(op.id),
                          disabled: isOperatorDisabled(op),
                        }" @click="!isOperatorDisabled(op) && toggleOperator(op)">
                          <span>
                            {{ op.name }}
                            <div v-if="op.hasEx" class="ex-icon">
                              ex
                            </div>
                          </span>
                          <CheckOutlined v-if="selectedOperatorIds.includes(op.id)" class="check-icon" />
                        </div>
                      </div>
                    </a-collapse-panel>
                  </a-collapse>
                </div>
              </div>
            </template>
            <template #default>
              <div ref="operatorSelectorTriggerRef" class="operator-selector-trigger"
                :class="{ 'has-selection': selectedOperators.length > 0 }">
                <span class="selector-text">
                  请选择算子工程
                </span>
                <span class="selector-arrow">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </div>
            </template>
          </a-popover>
        </div>

        <!-- 已选择的算子工程显示区域（组件收起后显示） -->
        <div v-if="(hasMultipleOperators || isStandardCustom) && !operatorSelectorVisible && selectedOperators.length > 0"
          class="px-3 py-2 mb-2">
          <div class="selected-display-section">
            <div class="selected-display-header">
              已选择 {{ selectedOperators.length }} 项
            </div>
            <div class="selected-display-tags">
              <a-tag v-for="op in selectedOperators" :key="op.id" closable class="mb-2 mr-2"
                @close="removeOperator(op.id)">
                {{ op.name }}
              </a-tag>
            </div>
          </div>
        </div>

        <a-menu mode="inline" :open-keys="openKeys" :selected-keys="selectedKeys"
          class="border-r-0 bg-transparent -ml-3" @open-change="onOpenChange" @click="handleMenuClick">
          <template v-for="item in menuItems">
            <!-- 有子菜单的情况 -->
            <a-sub-menu v-if="item.children && item.children.length > 0" :key="`submenu-${item.key}`">
              <template #title>
                <span v-if="item.icon" class="inline-flex items-center text-[11px]">
                  <img :src="item.icon" alt="" class="w-4 h-4 mr-2 align-middle" />
                  <span class="text-white/85">{{ item.label }}</span>
                </span>
                <span v-else class="text-white/85">{{ item.label }}</span>
              </template>
              <template v-for="child in item.children">
                <!-- 子菜单项 -->
                <a-menu-item v-if="!child.children || child.children.length === 0" :key="`menuitem-${child.key}`"
                  :disabled="isMenuItemDisabled(child.key)" :class="{
                    'opacity-50 cursor-not-allowed':
                      isMenuItemDisabled(child.key),
                  }">
                  <div class="single-box">
                    {{ child.label }}
                    <div v-if="child.key === 'simulation' || child.key === 'onboard'" class="setting-box">
                      <SettingOutlined @click.stop="openSetting(child.key)" />
                    </div>
                  </div>
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
            <a-menu-item v-else :key="`menuitem-${item.key}`" :disabled="isMenuItemDisabled(item.key)" :class="{
              'opacity-50 cursor-not-allowed':
                isMenuItemDisabled(item.key),
            }">
              <div v-if="item.icon" class="single-box">
                <span class="inline-flex items-center text-[11px]">
                  <img :src="item.icon" alt="" class="w-4 h-4 mr-2 align-middle" />
                  <span class="text-white/85">{{ item.label }}</span>
                </span>
                <div v-if="item.key === 'sanitizer'" class="setting-box">
                  <SettingOutlined @click.stop="openSetting(item.key)" />
                </div>
              </div>
              <span v-else class="text-white/85">{{ item.label }}</span>
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

/* 算子工程选择器样式 */
.operator-selector-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 4px 11px;
  background-color: #262729;
  border: 1px solid #434343;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.operator-selector-trigger:hover {
  border-color: #177ddc;
}

.operator-selector-trigger.has-selection {
  color: rgba(255, 255, 255, 0.85);
}

.selector-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.25);
}

.operator-selector-trigger.has-selection .selector-text {
  color: rgba(255, 255, 255, 0.85);
}

.selector-arrow {
  display: flex;
  align-items: center;
  margin-left: 8px;
  color: rgba(255, 255, 255, 0.45);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.operator-selector-wrapper {
  position: relative;
}

:deep(.operator-selector-popover) {
  .ant-popover-inner-content {
    padding: 0;
  }
}

.operator-selector-content {
  padding: 8px;
  background-color: #1f1f1f;
}

.selected-section {
  margin-bottom: 8px;
}

.selected-header {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 8px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.divider {
  height: 1px;
  background-color: #434343;
  margin: 0;
}

.search-section {
  margin-top: 8px;
}

.operator-collapse {
  :deep(.ant-collapse-item) {
    background-color: #262729;
    border: none;
  }

  :deep(.ant-collapse-header) {
    padding: 8px !important;
    background-color: rgb(31, 31, 31);
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 11px;
  }

  :deep(.ant-collapse-content) {
    background-color: rgb(31, 31, 31);
    border: none;
  }

  :deep(.ant-collapse-content-box) {
    padding: 8px 0 !important;
    max-height: 280px;
    overflow-y: auto;
  }

  :deep(.ant-collapse-expand-icon) {
    color: rgba(255, 255, 255, 0.85) !important;
  }
}

.operator-list {
  display: flex;
  flex-direction: column;
}

.operator-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);

  &:hover:not(.disabled) {
    background-color: #262729;
  }

  &.selected {
    background-color: #111b26;
    color: #177ddc;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: rgba(255, 255, 255, 0.25);
  }

  >span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}

.ex-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 2px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  background-color: transparent;
  margin-left: 6px;
  flex-shrink: 0;
}

.check-icon {
  color: #177ddc;
  font-size: 11px;
  flex-shrink: 0;
  margin-left: auto;
}

.selected-display-section {
  padding: 8px;
  background-color: #1f1f1f;
  border-radius: 6px;
  border: 1px solid #434343;
}

.selected-display-header {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 8px;
}

.selected-display-tags {
  display: flex;
  flex-wrap: wrap;
}
</style>
