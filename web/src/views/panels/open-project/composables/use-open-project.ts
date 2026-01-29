import {
  ref, reactive, onBeforeUnmount, onMounted,
} from 'vue';
import { message } from 'ant-design-vue';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import {
  getHome,
  getLastProjectPath,
  getWorkspace,
  openProject,
} from '@web/apis';
import { selectFolder, selectFile } from '@web/apis/performance-run-data';
import { MessageHandlerStrategyManager } from '../../link/composables/message-handler-strategies';
import { SearchStrategyFactory } from '../../link/composables/search-strategies';

/**
 * Open Project Composable
 * 封装打开算子工程相关的业务逻辑
 */
export function useOpenProject() {
  const connectionFormRef = ref<AntdVForm | null>(null);

  // 路径相关状态
  const isPathSetFromContextMenu = ref(false);
  const workspacePath = ref<string | null>(null);
  const homePath = ref<string | null>(null);

  // 搜索策略实例
  const projectPathSearchStrategy =
    SearchStrategyFactory.getStrategy('projectPath');
  const projectSHSearchStrategy =
    SearchStrategyFactory.getStrategy('projectSH');

  // 消息处理策略管理器
  const messageHandlerManager = new MessageHandlerStrategyManager();

  // 表单数据（去掉 projectName）
  const projectFormData = reactive({
    projectPath: '/home/developer',
    projectSH: '/etc/profile',
  });

  // 监听来自 iframe 的远程搜索结果
  const handleRemoteSearchResult = (event: MessageEvent) => {
    if (event.data.command === 'iframeRemoteSearchResult') {
      const {
        type, list = [],
      } = (event.data.data as {
        type?: 'projectPath' | 'projectSH';
        list?: Array<{ path: string }>;
      }) || {};
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectPath') {
        projectPathSearchStrategy.getOptions().value = mapped;
        projectPathSearchStrategy.getLoading().value = false;
      }
      else if (type === 'projectSH') {
        projectSHSearchStrategy.getOptions().value = mapped;
        projectSHSearchStrategy.getLoading().value = false;
      }
    }
  };

  // 监听来自 iframe 的消息
  const messageHandler = (event: MessageEvent) => {
    // 先处理远程搜索结果
    handleRemoteSearchResult(event);

    // 再处理其他消息
    const messageData = event.data;
    // 创建消息处理上下文，直接传递 reactive 对象属性
    const context = {
      homePath,
      workspacePath,
      projectPath: projectFormData,
      isPathSetFromContextMenu,
    };

    messageHandlerManager.handle(messageData, context);
  };

  // 远程搜索
  const remoteSearch = async (
    type: 'projectPath' | 'projectSH',
    keyword: string,
  ) => {
    const strategy = SearchStrategyFactory.getStrategy(type);

    await strategy.search(keyword);
  };

  // 选择目录
  const handleSelectFolder = async () => {
    try {
      const selectedPath = await selectFolder({
        defaultPath: projectFormData.projectPath,
      });
      if (selectedPath) {
        projectFormData.projectPath = selectedPath;
      }
    }
    catch (error) {
      console.error('选择目录失败:', error);
      message.error('选择目录失败');
    }
  };

  // 选择文件
  const handleSelectFile = async () => {
    try {
      const selectedPath = await selectFile({
        defaultPath: projectFormData.projectSH,
      });
      if (selectedPath) {
        projectFormData.projectSH = selectedPath;
      }
    }
    catch (error) {
      console.error('选择文件失败:', error);
      message.error('选择文件失败');
    }
  };

  // 打开项目
  const handleOpenProject = async () => {
    // 先进行表单校验
    try {
      await connectionFormRef.value?.validate();
    }
    catch {
      return;
    }

    try {
      await openProject({
        projectPath: projectFormData.projectPath,
        projectSH: projectFormData.projectSH,
        projectName: ''
      });
      message.success('算子工程打开成功');
    }
    catch (error) {
      console.error('打开项目失败:', error);
      message.error('打开项目失败');
    }
  };

  // 初始化路径信息
  const initPathInfo = async () => {
    try {
      const workspace = await getWorkspace();

      if (workspace) {
        workspacePath.value = workspace;
        window.postMessage(
          {
            command: 'iframeSetWorkspace',
            data: workspace,
          },
          '*',
        );
      }

      const lastProjectPath = await getLastProjectPath();

      if (lastProjectPath) {
        window.postMessage(
          {
            command: 'iframeSetLastProjectPath',
            data: lastProjectPath,
          },
          '*',
        );
      }

      const home = await getHome();

      if (home) {
        window.postMessage({
          command: 'iframeSetHome',
          data: home,
        }, '*');
      }
    }
    catch (error) {
      console.error('获取路径信息失败:', error);
    }
  };

  onMounted(() => {
    window.addEventListener('message', messageHandler);
    initPathInfo();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('message', messageHandler);
  });

  return {
    connectionFormRef,
    projectFormData,
    projectPathOptions: projectPathSearchStrategy.getOptions(),
    projectPathLoading: projectPathSearchStrategy.getLoading(),
    projectSHOptions: projectSHSearchStrategy.getOptions(),
    projectSHLoading: projectSHSearchStrategy.getLoading(),
    remoteSearch,
    handleSelectFolder,
    handleSelectFile,
    handleOpenProject,
  };
}
