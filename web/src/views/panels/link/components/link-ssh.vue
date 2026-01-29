<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { useLinkSSH } from '../composables/use-link-ssh';
import { FormRulesFactory } from '../composables/form-rules';
import tipBase_1_1 from '@/assets/imgs/hello_world.png';
import tipBase_1_2 from '@/assets/imgs/add_custom.png';
import tipBase_1_3 from '@/assets/imgs/torch_library_template.png';
import jsonUrl from './test.json'
import {
  getProjectType,
} from '@web/apis';

defineProps({
  connected: {
    type: Number,
    default: 0,
  },
});

// 模板类型选择
const selectedTemplate = ref<'helloworld' | 'addn' | 'torch_library_template'>('helloworld');

// 使用 composable 获取业务逻辑
const {
  connectionFormRef,
  selectedId_type,
  projectFormData,
  projectPathOptions,
  projectPathLoading,
  projectSHOptions,
  projectSHLoading,
  remoteSearch,
  handleSelectFolder,
  handleSelectFile,
  handleCreatedProject,
} = useLinkSSH(selectedTemplate);

// 根据模板类型获取描述
const getTemplateDesc = (template: string) => {
  switch (template) {
    case 'helloworld':
      return '生成<<<>>>异构运行的.asc代码，默认打印"Hello World"';
    case 'addn':
      return '生成<<<>>>异构运行的.asc，默认实现addn算子';
    case 'torch_library_template':
      return '生成<<<>>>接入rotch licrary的.asc代码，默认实现add算子';
    default:
      return '生成<<<>>>异构运行的.asc代码，默认打印"Hello World"';
  }
};

// 根据模板类型获取图片
const getTemplateImage = (template: string) => {
  switch (template) {
    case 'helloworld':
      return tipBase_1_1;
    case 'addn':
      return tipBase_1_2;
    case 'torch_library_template':
      return tipBase_1_3;
    default:
      return tipBase_1_1;
  }
};

// 工程类型相关配置
const cannProject = {
  id: 1,
  title: '【Ascend C】<<<>>>算子工程',
  desc: '创建<<<>>>调用的addn工程样例，支持".asc"后缀的异构编译。',
}
const ascendProject = {
  id: 2,
  title: '【Ascend C】标准自定义算子工程',
  desc: '基于Ascend C语言的标准自定义算子工程，op_host存放在CPC侧的代码实现，op_kermel存放NPU侧的代码实现，op_graph存放图模式下的代码实现 <span style="color: #ff4d4f; font-weight: bold;">(因为该算子的编译依赖ops-math项目，该算子将自动放到ops-math项目中math目录中，后续提交代码需要迁移到自己的fork代码仓中操作)</span>'
}
const pyascProject = {
  id: 3,
  title: '【Python】pyasc算子工程',
  desc: '创建<<<>>>调用的hallo_world工程样例，支持.asc后缀的异构编译' 
}
const items_type = ref([cannProject, pyascProject])

const tipBase_0 = jsonUrl.url

const connectionFormRules = FormRulesFactory.createFormRules();

const currentProjectType = ref('')
onMounted(async () => {
  // 获取当前项目类型
  try {
    const result = await getProjectType();
    currentProjectType.value = result.projectType || '';
    console.log('[Operate] 当前项目类型:', currentProjectType.value);

    // 标准自定义算子大目录下，只能新建标准自定义算子
    if (currentProjectType.value === 'ascend') {
      items_type.value = [ascendProject]
      selectedId_type.value = 2
    }
  }
  catch (error) {
    console.error('[Operate] 获取项目类型失败:', error);
    currentProjectType.value = '';
  }
})
</script>
<template>
  <div class="">
    <div class="flex w-full items-stretch max-[960px]:flex-wrap">
      <div class="w-[35%] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0">
        <div class="text-base leading-[22px] font-bold text-white mb-6">
          工程类型
        </div>
        <div class="">
          <div class="mb-5">
            <div
              v-for="item in items_type"
              :key="item.id"
              class="bg-transparent p-5 my-5 border border-[#464646] rounded-lg cursor-pointer transition-all duration-300 overflow-hidden relative hover:border-[#4ba5f4] hover:shadow-[0_0_0_3px_rgba(24,144,255,0.1)] group max-[960px]:flex-auto max-[960px]:min-w-0"
              :class="{
                'border-[#4ba5f4] shadow-[0_0_0_3px_rgba(24,144,255,0.1)] selected':
                  selectedId_type === item.id,
              }"
              @click="selectedId_type = item.id"
            >
              <div class="font-extrabold text-[initial] mb-[25px] text-white">
                {{ item.title }}
              </div>
              <div
                class="leading-8 mt-2.5 text-white text-[13px] mb-2.5 whitespace-nowrap overflow-hidden text-ellipsis group-[.selected]:whitespace-normal group-[.selected]:overflow-visible group-[.selected]:text-clip"
                v-html="item.id === 1 ? getTemplateDesc(selectedTemplate) : item.desc"
              >
              </div>
              <a-tag v-if="item.id === 1 || item.id === 2" color="blue" class="mt-2.5 mr-2">
                语言：Ascend C
              </a-tag>
              <a-tag v-if="item.id === 3" color="blue" class="mt-2.5 mr-2">
                语言：Python
              </a-tag>
              <a-tag v-if="item.id === 1" color="purple" class="mt-2.5 mr-2">
                类型：<<<>>>
              </a-tag>
              <a-tag v-if="item.id === 2" color="green" class="mt-2.5 mr-2">
                类型：标准自定义
              </a-tag>
              <a-tag v-if="item.id === 3" color="purple" class="mt-2.5 mr-2">
                类型：pyasc
              </a-tag>
              <div
                v-if="item.id === 1"
                class="mt-4 flex gap-4">
                <a-radio-group
                  v-model:value="selectedTemplate"
                  class="flex gap-4">
                  <a-radio value="helloworld">
                    helloworld
                  </a-radio>
                  <a-radio value="addn">
                    addn
                  </a-radio>
                  <a-radio value="torch_library_template">
                    torch_library
                  </a-radio>
                </a-radio-group>
              </div>
              <transition name="slide-fade">
                <div v-if="selectedId_type === item.id"
                  class="mt-5 pt-5 border-t border-white/15 transition-all duration-300">
                  <div style="margin-bottom: 20px; margin-top: 20px">
                    工程目录结构示意
                  </div>
                  <div class="overflow-hidden max-w-full transition-all duration-300">
                    <a-image :src="item.id === 1 ? getTemplateImage(selectedTemplate) : tipBase_0"
                      class="block max-w-full h-auto object-contain transition-opacity duration-300 transform" />
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div class="w-px bg-white/15 mx-4 shrink-0 self-stretch" />
      <div
        class="w-[65%] text-left text-sm font-normal leading-[22px] max-[960px]:flex-auto max-[960px]:w-full max-[960px]:min-w-0 [&_.ant-form-item-label_.help-icon]:text-white/45 [&_.ant-form-item-label_.help-icon]:cursor-help [&_.ant-form-item-label_.help-icon]:text-sm [&_.ant-form-item-label_.help-icon]:ml-1">
        <div class="text-base leading-[22px] font-bold text-white mb-6">
          工程配置
        </div>
        <a-form ref="connectionFormRef" :model="projectFormData" :label-col="{ span: 6 }" :wrapper-col="{ span: 24 }"
          :rules="connectionFormRules as any" layout="vertical">
          <a-form-item name="projectName">
            <template #label>
              <span>算子工程名称</span>
              <a-tooltip title="新建算子的名称，用于代码中的算子的定义，并默认用于工程名称。支持数字、字母、下划线">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-input v-model:value="projectFormData.projectName" placeholder="请输入算子工程名称（只能包含字母、数字和下划线，必须以字母开头）" />
          </a-form-item>
          <a-form-item name="projectPath">
            <template #label>
              <span>算子工程位置</span>
              <a-tooltip title="您所创建的算子工程的存储路径。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectPath" :options="projectPathOptions"
              :loading="projectPathLoading" placeholder="请输入工程位置，支持远程搜索"
              @search="(val) => remoteSearch('projectPath', val)" @focus="handleSelectFolder" />
          </a-form-item>
          <a-form-item name="projectSH">
            <template #label>
              <span>环境变量配置脚本</span>
              <a-tooltip
                title="安装CANN包后需要执行的set_env.sh脚本的绝对路径信息，如果使用的是一站式开发平台提供的容器镜像，则此处可以置空。若出现报错提示路径不存在，说明非有效环境变量脚本路径，需要输入设置环境变量脚本的绝对路径。">
                <QuestionCircleOutlined class="help-icon" />
              </a-tooltip>
            </template>
            <a-auto-complete v-model:value="projectFormData.projectSH" :options="projectSHOptions"
              :loading="projectSHLoading" placeholder="请输入环境变量.sh文件地址，支持远程搜索"
              @search="(val) => remoteSearch('projectSH', val)" @focus="handleSelectFile" />
          </a-form-item>
        </a-form>
        <a-button type="primary" class="!mt-6 !w-[84px] !h-8 !rounded-none" @click="handleCreatedProject">
          立即创建
        </a-button>
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
