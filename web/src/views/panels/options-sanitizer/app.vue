<script setup lang="ts">
import {
    ref, onBeforeMount,
} from 'vue';
import { theme, message } from 'ant-design-vue';
import {
    getSanitizerConfigs, 
    saveSanitizerForm as saveSanitizerFormAPI, 
    runSanitizer, 
    checkTaskStatus, 
    executeVscodeCommand,
    getSelectedOperators
} from '@web/apis';

const themeConfig = { algorithm: theme.darkAlgorithm };
const isExecuting = ref(false)
const form = ref({
  tool: {
    memcheck: true,
    racecheck: false,
    initcheck: false,
  }, // 检测内容
  memcheckOption: {
    'check-unused-memory': false,
    'leak-check': false,
  }, // 内存检测可选项
});

async function loadSanitizerForm() {
  const configs = await getSanitizerConfigs();
  const obj = (configs[0] || {})?.user_options || {};

  Object.keys(form.value)
    .forEach((key) => {
      if (obj[key] !== undefined) {
        form.value[key] = obj[key];
      }
    });
}

async function saveSanitizerForm() {
  await saveSanitizerFormAPI({ data: JSON.parse(JSON.stringify(form.value)) });
}

onBeforeMount(async () => {
  await loadSanitizerForm();
});

const handleConfirm = async () => {
  if (!form.value || isExecuting.value) {
    return;
  }
  const hasRunningTask = await checkTaskStatus();
  console.log('hasRunningTask', hasRunningTask);
  if (hasRunningTask) {
    message.info('存在未执行完毕的任务，请稍后再试');
    return;
  }
  try {
    isExecuting.value = true;
    
    // 获取已选择的算子名称（如果是标准自定义算子）
    let operatorNames: string | undefined;
    try {
      const selectedOperators = await getSelectedOperators();
      if (selectedOperators) {
        operatorNames = selectedOperators;
      }
    } catch (error) {
      console.warn('获取已选择的算子失败:', error);
    }
    
    // 执行异常检测
    await runSanitizer({ operatorNames });
    setTimeout(() => {
      executeVscodeCommand('workbench.action.closeActiveEditor');
    }, 500);
  }
  catch (error) {
    console.error('异常检测启动失败: ', error);
  }
  finally {
    isExecuting.value = false;
  }
};
</script>

<template>
    <a-config-provider :theme="themeConfig">
        <div class="sanitizer-config-page">
            <div class="page-header">
                异常检测-选择检测内容
            </div>

            <div class="sanitizer-content">
                <a-checkbox v-model:checked="form.tool.memcheck" @change="saveSanitizerForm">
                    内存检测
                </a-checkbox>
                <div v-if="form.tool.memcheck" class="mem-check">
                    <div class="desc">
                        基础检测:默认会开启非法读写、多核踩踏、非对齐访问和非法释放
                    </div>
                    <div class="desc">
                        可选检测:
                    </div>
                    <div class="mem-option">
                        <a-checkbox v-model:checked="form.memcheckOption['leak-check']" @change="saveSanitizerForm">
                            内存泄漏
                        </a-checkbox>
                        <a-checkbox 
                            v-model:checked="form.memcheckOption['check-unused-memory']"
                            style="margin-left: 12px;"
                            @change="saveSanitizerForm">
                            分配内存未使用
                        </a-checkbox>
                    </div>
                </div>
                <div class="check-item-row">
                    <a-checkbox v-model:checked="form.tool.racecheck" @change="saveSanitizerForm">
                        竞争检测
                    </a-checkbox>
                </div>
                <div class="check-item-row">
                    <a-checkbox v-model:checked="form.tool.initcheck" @change="saveSanitizerForm">
                        未初始化检测
                    </a-checkbox>
                </div>

                <div class="footer-actions">
                    <a-button type="primary" :loading="isExecuting" @click="handleConfirm">
                        立即开始
                    </a-button>
                </div>
            </div>
        </div>
    </a-config-provider>
</template>

<style lang="less" scoped>
.sanitizer-config-page {
  .page-header {
    font-size: 22px;
    font-weight: bold;
    border-bottom: 1px #424242 solid;
    text-align: left;
    padding: 20px;
  }

  .sanitizer-content {
    padding: 20px;
  }

  .mem-check {
    width: fit-content;
    margin-top: 8px;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    .desc {
        margin-bottom: 8px;
    }
  }

  .check-item-row {
    margin-top: 12px;
  }

  .footer-actions {
    margin-top: 12px;
  }
}
</style>
