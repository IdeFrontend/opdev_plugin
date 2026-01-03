<script setup lang="ts">
import { ref, reactive, onBeforeUnmount, onMounted } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import { message as antdMessage } from 'ant-design-vue';
import {
  checkPathExists,
  remotePathSearch,
  createdProject,
  getHome,
  getLastProjectPath,
  getWorkspace,
} from '@/apis';

const emit = defineEmits(['connected']);

const props = defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

const projectPathOptions = ref<Array<{ value: string }>>([]);
const projectSHOptions = ref<Array<{ value: string }>>([]);
const projectPathLoading = ref(false);
const projectSHLoading = ref(false);
const connectionFormRef = ref<AntdVForm | null>(null);

// 工程类型相关
const selectedId_type = ref(1);
const items_type = [
  {
    id: 1,
    title: '【Ascend C】<<<>>>算子工程',
    desc: '创建<<<>>>调用的addn工程样例，支持".asc"后缀的异构编译。',
  },
  // { id: 2, title: '【Ascend C】标准自定义算子工程', desc: '基于Ascend C语言的标准自定义算子工程，op_host存放在CPC侧的代码实现，op_kermel存放NPU侧的代码实现，op_graph存放图模式下的代码实现 <span style="color: #ff4d4f; font-weight: bold;">(因为该算子的编译依赖ops-math项目，该算子将自动放到ops-math项目中math目录中，后续提交代码需要迁移到自己的fork代码仓中操作)</span>' },
];
const items_proto = [
  {
    id: 1,
    title: '使用原型定义文件模版',
    desc: '从标准模版开始编写算子原型，完成后可基于此生成工程。',
  },
  {
    id: 2,
    title: '上传原型定义文件（json）',
    desc: '若您已有现成的算子原型文件，可直上传并生成工程',
  },
];
const tipBase_0 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaIAAADOCAYAAAB8Sgb6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAACGnSURBVHhe7d0PbBvXnSfwbxI7WZuuEl3pBeuNalhMu5Zd00XDqEjgy/IUL+8OYTZiHKxxPmSbBVWsVAMSzlWwSfai5bpXJ0UZFxKQlbERse0WCKBFHbKNDgsIFx3vEARdhQmuNGwJbSivoZyPm6hVqiudzSXrvfdm3gyHw+E/idJI9veTMuH84czoT+fL33tPfLf4fL5/ARERkUtuVf8lIiJyBYOIiIhcxSAiIiJXMYiIiMhV6zNYoW8UU71+8aSI7NnjiM/oq0vrLRZSiAwm9ef1tlfTE8fkqSA8ahHIIxUZAsamEO3Un+tHiGF0Kgq/cUz76+T6XKDyGqSVLBIn4sjYr9F6fdbjlV13CPFXhhFsE0+dvp6K75e6Tn1r6dziaUz7mvTV5v6d+uvz6QiGJtQmdcyydRUs16W+Z+YVj0xiuFt+JQ7fP+25ZN1mPZbB+vN32C6/F+kO7XuG2QSOn5ZfoU3F90Zf7fS7UtSO4bddo0F/feaI8XXptO8PqpyDiDZERUXk8bZbbuhOPGj31t4jFjBuAx50HQmp5yXy//yRiHiczaLYGcXUK3Fxmyqpt72MvCGpG5n2GvFIzC6rjbWIm6oMDXkz1F6XQHZJrJ4YKp1bLMqbm7ZsCaGK6xuLaUcs0xkQZ1B6Qugqu0E7kTd1eROUN2xxI5Xho11XBKl5fQ8ZDtFOebNU50/P6Rtawo9An3oqvtuh/fafsSXEtesS368VP6JTo6WvU7Je94IHwVNTGDWPK1i2132DITT6u5SYLcLTPYB4TxJD2vHl9YkdzPPpgS1DyPrz035T5M9c/byJaOPZgugBDCWSGHsqXCWMPAj/2TkkvzMg9qwmhoB8x76Q1W4Env3ipqZvqDQTx7i4gaCtC6Eetc6q3nb5LrtH3KjEzWbc8m46czpuvrOvqqcDPvVUl0H8dK1Xlc6VMioM4/o6w2KbWicUV+QtrXRjDx3pgkesa+xG50e7LbSS4uuRX53f/gZgIt7gu3cZIlPOgSmpa/MH1HYtOMU6eSNXQiNhcWUiBNPG90h8vybkzduP8IjzTzg5mBLxajlu0xr/XcpcLYh/izdJZrVYKbSn/Ccuf37xqtUiEW0UWxC9iTMnz2Ex0O8QRnoIxTp/hnODCbFnFX0BcWsS71Rz4uY5XytEdPVuIDW3G5XG0qJ2o27KTAZz8kYrKxpxky571+6kyrkcr29+znID1quLolgn96wvidyC+E9bEMPiuiYtN/lkTh5VrzKcqkR/r1gvA0c+bM1Wtc1hTp5TVXF6cIp1skLUGBVSAYvW4JtZ1L4mj7faufJYlt9jb0fpWtXXJa/R+rU5auJ3Sa+c8sjVCJbMG3N64GrfJ1slR0SuqRysUJxGvN8eRiKEnhrTQigpQmi6xlt76w3BuEk7Nam0UnFJ3qCbJd7Rn9CbdCTt5lStYrBo7FwZPUzkjV1VF3NvLOqbGpAcjCCS1s/j6R4uhY7WbKhXGfoNfbKsEjObnORDvV6nmqtqNIVltJCTVZwRnBlUXPHKsn7utbA0zTn2CVk08rtkhG8Ussmw1MflSFRAx40mO/G1RsXr6r4BIaJ15zxqToVR/mBMhNHDeFiG0P65uiFkNqWo/5Mb78prNanozSVFLMsbt4Oa24135LWa/6xUc5w1TDKnj4sbmLo5Wft17KqcS7++ynfievXiR7hPry4yzXaAq76qlFYdWSsBFSpa0LQw5CdyWsj4ewZUcJbVfViU1ZG9IlHfz3yu2u1fNTOupmJt8HdJC1/5vajWV1dBfwNi9AmtvtmQiFrFOYgkEUZnTiZFGA00GEKC0ZRieWdeeSO16NM7j7Eggs/pRl1vu7gpp7Q+pCAGLM08sTG[... 9659 chars omitted ...]
const tipBase_1 =
  'data:image/png;base64,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[... 4051 chars omitted ...]

// C++ 关键字列表
const CPP_KEYWORDS = [
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char16_t',
  'char32_t',
  'class',
  'compl',
  'const',
  'constexpr',
  'const_cast',
  'continue',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'register',
  'reinterpret_cast',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
];

// 生成默认算子工程名称 op_XXXXXX（随机六位数字）
const generateDefaultProjectName = () => {
  const num = Math.floor(100000 + Math.random() * 900000);

  return `op_${num}`;
};

// 表单数据
const projectFormData = reactive({
  // 算子工程位置默认值
  projectPath: '/home/developer',
  // 算子工程名称默认值
  projectName: generateDefaultProjectName(),
  // 环境变量配置脚本默认值
  projectSH: '/etc/profile',
});

// 表单校验规则
const connectionFormRules = {
  projectPath: [
    { required: true, message: '请输入算子工程位置', trigger: 'blur' },
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        const pathExists = await checkPathExists({ path: value });

        return pathExists
          ? Promise.resolve()
          : Promise.reject('目录不存在，请先创建目录');
      },
    },
  ],
  projectName: [
    { required: true, message: '请输入算子工程名称', trigger: 'blur' },
    {
      validator: (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        // 规则1: 只能使用字母、数字和下划线
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return Promise.reject('算子工程名称只能包含字母、数字和下划线');
        }
        // 规则2: 首字母必须是字母
        if (!/^[a-zA-Z]/.test(value)) {
          return Promise.reject('算子工程名称必须以字母开头');
        }
        // 规则3: 不能是C++关键字
        if (CPP_KEYWORDS.includes(value.toLowerCase())) {
          return Promise.reject('算子工程名称不能是C++关键字');
        }

        return Promise.resolve();
      },
      trigger: 'blur',
    },
  ],
  projectSH: [
    {
      trigger: 'blur',
      validator: async (rule, value) => {
        if (!value) {
          return Promise.resolve();
        }
        const pathExists = await checkPathExists({
          path: value,
          mustFile: true,
        });

        return pathExists
          ? Promise.resolve()
          : Promise.reject('脚本文件不存在，请确认');
      },
    },
  ],
};

const rateNumber = ref(0);
const maxRate = ref(10);

// 监听来自 iframe 的远程搜索结果
window.addEventListener('message', (event) => {
  if (event.data.command === 'iframeRemoteSearchResult') {
    const { type, list = [] } = event.data.data || {};
    const mapped = list.map((item) => ({ value: item.path }));

    if (type === 'projectPath') {
      projectPathOptions.value = mapped;
      projectPathLoading.value = false;
    } else if (type === 'projectSH') {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  }
});

const addRateLoop = () => {
  if (rateNumber.value < maxRate.value) {
    rateNumber.value++;
  } else if (rateNumber.value === maxRate.value && maxRate.value !== 100) {
    rateNumber.value = 0;
  }

  if (maxRate.value !== 100) {
    setTimeout(() => {
      addRateLoop();
    }, 50);
  } else {
    rateNumber.value = 100;
  }
};

// 校验算子工程名称
const validateProjectName = (projectName) => {
  if (!projectName || projectName.trim() === '') {
    antdMessage.error('请输入算子工程名称');

    return false;
  }

  // 规则1: 只能使用字母、数字和下划线
  if (!/^[a-zA-Z0-9_]+$/.test(projectName)) {
    antdMessage.error('算子工程名称只能包含字母、数字和下划线');

    return false;
  }

  // 规则2: 首字母必须是字母
  if (!/^[a-zA-Z]/.test(projectName)) {
    antdMessage.error('算子工程名称必须以字母开头');

    return false;
  }

  // 规则3: 不能是C++关键字
  if (CPP_KEYWORDS.includes(projectName.toLowerCase())) {
    antdMessage.error('算子工程名称不能是C++关键字');

    return false;
  }

  return true;
};

const handleCreatedProject = async () => {
  // 先进行表单校验
  try {
    await connectionFormRef.value?.validate();
  } catch (error) {
    return;
  }

  // 再次校验算子工程名称（双重校验确保）
  if (!validateProjectName(projectFormData.projectName)) {
    return;
  }

  try {
    await createdProject({
      ...projectFormData,
      createOperatorProjectDictoryFileType: selectedId_type.value,
    });
  } catch (error) {
    console.error('创建项目失败:', error);
    antdMessage.error('创建项目失败');
  }
};

const buildDefaultSearchPath = (value = '') => {
  if (value) return value;

  return '/';
};

const remoteSearch = async (type, keyword) => {
  const searchValue = keyword || '';

  if (type === 'projectPath') {
    projectPathLoading.value = true;
  } else {
    projectSHLoading.value = true;
  }
  try {
    const result = await remotePathSearch({
      type,
      keyword: buildDefaultSearchPath(searchValue.trim()),
    });
    const { type: resultType, list = [] } = result;
    const mapped = list.map((item) => ({ value: item.path }));

    if (resultType === 'projectPath') {
      projectPathOptions.value = mapped;
      projectPathLoading.value = false;
    } else if (resultType === 'projectSH') {
      projectSHOptions.value = mapped;
      projectSHLoading.value = false;
    }
  } catch (error) {
    projectPathLoading.value = false;
    projectSHLoading.value = false;
    console.error('远程搜索失败:', error);
  }
};

// 监听来自 iframe 的消息
const messageHandler = (event: MessageEvent) => {
  const message = event.data;

  if (message.command === 'iframeSetHome') {
    const obj = message.data || '/home/developer';

    homePath.value = obj;
    if (
      !isPathSetFromContextMenu.value &&
      (!projectFormData.projectPath ||
        projectFormData.projectPath === '/home/developer')
    ) {
      if (workspacePath.value) {
        projectFormData.projectPath = workspacePath.value;
      } else {
        projectFormData.projectPath = obj;
      }
    }
  } else if (message.command === 'iframeSetProjectPath') {
    if (message.data) {
      projectFormData.projectPath = message.data;
      isPathSetFromContextMenu.value = true;
    }
  } else if (message.command === 'iframeSetLastProjectPath') {
    if (!isPathSetFromContextMenu.value && message.data) {
      projectFormData.projectPath = message.data;
    }
  } else if (message.command === 'iframeSetWorkspace') {
    workspacePath.value = message.data || null;
    if (workspacePath.value && !isPathSetFromContextMenu.value) {
      const currentPath = projectFormData.projectPath;
      const isDefaultPath = !currentPath || currentPath === '/home/developer';
      const isHomePath = homePath.value && currentPath === homePath.value;

      if (isDefaultPath || isHomePath) {
        projectFormData.projectPath = workspacePath.value;
      }
    }
  }
};

onBeforeUnmount(() => {
  window.removeEventListener('message', messageHandler);
});

// 标记是否已从右键菜单设置过路径
const isPathSetFromContextMenu = ref(false);
// 工作区路径
const workspacePath = ref<string | null>(null);
// HOME 路径
const homePath = ref<string | null>(null);

onMounted(async () => {
  window.addEventListener('message', messageHandler);

  // 先获取工作区路径，再获取缓存的路径，最后获取 HOME（优先级从高到低）
  try {
    const workspace = await getWorkspace();

    if (workspace) {
      workspacePath.value = workspace;
      window.postMessage(
        { command: 'iframeSetWorkspace', data: workspace },
        '*',
      );
    }

    const lastProjectPath = await getLastProjectPath();

    if (lastProjectPath) {
      window.postMessage(
        { command: 'iframeSetLastProjectPath', data: lastProjectPath },
        '*',
      );
    }

    const home = await getHome();

    if (home) {
      window.postMessage({ command: 'iframeSetHome', data: home }, '*');
    }
  } catch (error) {
    console.error('获取路径信息失败:', error);
  }
});
</script>
<template>
  <div class="">
    <div class="flex w-full items-stretch max-[960px]:flex-wrap">
      <div class="w-[35%] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0">
        <div class="text-base leading-[22px] font-bold text-white mb-6">工程类型</div>
        <div class="">
          <!-- <div class="title-tip">根据使用场景选择对应的算子工程，快速生成代码模板框架。注：<strong>若已存在算子工程，再次生成将会覆盖原工程。</strong></div> -->
          <div class="mb-5">
            <div
              v-for="item in items_type"
              :key="item.id"
              class="bg-transparent p-5 my-5 border border-[#464646] rounded-lg cursor-pointer transition-all duration-300 overflow-hidden relative hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)] group max-[960px]:flex-auto max-[960px]:min-w-0"
              :class="{ 'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)] selected': selectedId_type === item.id }"
              @click="selectedId_type = item.id"
            >
              <div class="font-extrabold text-[initial] mb-[25px] text-white">{{ item.title }}</div>
              <div
                class="leading-8 mt-2.5 text-white text-[13px] mb-2.5 whitespace-nowrap overflow-hidden text-ellipsis group-[.selected]:whitespace-normal group-[.selected]:overflow-visible group-[.selected]:text-clip"
                v-html="item.desc"
              ></div>
              <a-tag color="blue" class="mt-2.5 mr-2">语言：Ascend C</a-tag>
              <a-tag
                v-if="item.id === 1"
                color="purple"
                class="mt-2.5 mr-2"
                >类型：<<<>>></a-tag
              >
              <a-tag
                v-if="item.id === 2"
                color="green"
                class="mt-2.5 mr-2"
                >类型：标准自定义</a-tag
              >
              <transition name="slide-fade">
                <div
                  v-if="selectedId_type === item.id"
                  class="mt-5 pt-5 border-t border-white/15 transition-all duration-300"
                >
                  <div style="margin-bottom: 20px; margin-top: 20px">
                    工程目录结构示意
                  </div>
                  <div class="overflow-hidden max-w-full transition-all duration-300">
                    <a-image :src="item.id === 1 ? tipBase_1 : tipBase_0" class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div class="w-px bg-white/15 mx-4 shrink-0 self-stretch"></div>
      <div class="w-[65%] text-left text-sm font-normal leading-[22px] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0 [&_.ant-form-item-label_.help-icon]:text-white/45 [&_.ant-form-item-label_.help-icon]:cursor-help [&_.ant-form-item-label_.help-icon]:text-sm [&_.ant-form-item-label_.help-icon]:ml-1">
        <div class="text-base leading-[22px] font-bold text-white mb-6">工程配置</div>
        <a-form
          ref="connectionFormRef"
          :model="projectFormData"
          :label-col="{ span: 6 }"
          :wrapper-col="{ span: 24 }"
          :rules="connectionFormRules"
          layout="vertical"
        >
          <a-form-item name="projectName">
            <template #label>
              <span>算子工程名称</span>
              <a-tooltip
                title="新建算子的名称，用于代码中的算子的定义，并默认用于工程名称。支持数字、字母、下划线"
              >
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-input
              v-model:value="projectFormData.projectName"
              placeholder="请输入算子工程名称（只能包含字母、数字和下划线，必须以字母开头）"
            />
          </a-form-item>
          <a-form-item name="projectPath">
            <template #label>
              <span>算子工程位置</span>
              <a-tooltip title="您所创建的算子工程的存储路径。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete
              v-model:value="projectFormData.projectPath"
              :options="projectPathOptions"
              :loading="projectPathLoading"
              placeholder="请输入工程位置，支持远程搜索"
              @search="(val) => remoteSearch('projectPath', val)"
              @focus="
                () => remoteSearch('projectPath', projectFormData.projectPath)
              "
            />
          </a-form-item>
          <a-form-item name="projectSH">
            <template #label>
              <span>环境变量配置脚本</span>
              <a-tooltip
                title="安装CANN包后需要执行的set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径。"
              >
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete
              v-model:value="projectFormData.projectSH"
              :options="projectSHOptions"
              :loading="projectSHLoading"
              placeholder="请输入环境变量.sh文件地址，支持远程搜索"
              @search="(val) => remoteSearch('projectSH', val)"
              @focus="
                () => remoteSearch('projectSH', projectFormData.projectSH)
              "
            />
          </a-form-item>
        </a-form>
        <a-button
          type="primary"
          class="!mt-6 !w-[84px] !h-8 !rounded-none"
          @click="handleCreatedProject"
          >立即创建</a-button
        >
      </div>
    </div>
  </div>
</template>
<style scoped lang="less">
/* 针对整个页面的滚动条 */
::-webkit-scrollbar {
  width: 12px;
  /* 垂直滚动条宽度 */
  height: 12px;
  /* 水平滚动条高度 */
}

/* 滚动条轨道 */
::-webkit-scrollbar-track {
  background: #f1f1f1;
  /* 轨道背景色 */
  border-radius: 6px;
  /* 轨道圆角 */
}

/* 滚动条滑块 */
::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  /* 滑块颜色 */
  border-radius: 6px;
  /* 滑块圆角 */
  border: 2px solid #f1f1f1;
  /* 滑块边框，与轨道背景色相同形成间隔效果 */
}

/* 滑块悬停状态 */
::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
  /* 悬停时颜色变深 */
}

/* 滑块激活状态（点击时） */
::-webkit-scrollbar-thumb:active {
  background: #787878;
  /* 点击时颜色更深 */
}

/* 滚动条角落（垂直和水平滚动条交汇处） */
::-webkit-scrollbar-corner {
  background: #f1f1f1;
}

// 展开/收缩动画
.slide-fade-enter-active {
  transition:
    opacity 0.3s ease-out,
    transform 0.3s ease-out;
  overflow: hidden;
}

.slide-fade-leave-active {
  transition:
    opacity 0.3s ease-in,
    transform 0.3s ease-in;
  overflow: hidden;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.slide-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.slide-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
