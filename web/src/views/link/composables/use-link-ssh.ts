import { ref, reactive, onBeforeUnmount, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import {
  createdProject,
  getHome,
  getLastProjectPath,
  getWorkspace,
} from '@/apis';
import { ValidationStrategyFactory } from './validation-strategies';
import { MessageHandlerStrategyManager } from './message-handler-strategies';
import { SearchStrategyFactory } from './search-strategies';
import { ProjectNameFactory } from './project-name-factory';

/**
 * Link SSH Composable
 * 封装链接SSH相关的业务逻辑
 */
export function useLinkSSH() {
  const connectionFormRef = ref<AntdVForm | null>(null);
  const selectedId_type = ref(1);

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

  // 表单数据
  const projectFormData = reactive({
    projectPath: '/home/developer',
    projectName: ProjectNameFactory.generateDefaultProjectName(),
    projectSH: '/etc/profile',
  });

  // 监听来自 iframe 的远程搜索结果
  const handleRemoteSearchResult = (event: MessageEvent) => {
    if (event.data.command === 'iframeRemoteSearchResult') {
      const { type, list = [] } = (event.data.data as {
        type?: 'projectPath' | 'projectSH';
        list?: Array<{ path: string }>;
      }) || {};
      const mapped = list.map((item) => ({ value: item.path }));

      if (type === 'projectPath') {
        projectPathSearchStrategy.getOptions().value = mapped;
        projectPathSearchStrategy.getLoading().value = false;
      } else if (type === 'projectSH') {
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

  // 创建项目
  const handleCreatedProject = async () => {
    // 先进行表单校验
    try {
      await connectionFormRef.value?.validate();
    } catch {
      return;
    }

    // 再次校验算子工程名称（双重校验确保）
    if (
      !ValidationStrategyFactory.validateProjectName(
        projectFormData.projectName,
      )
    ) {
      return;
    }

    try {
      await createdProject({
        ...projectFormData,
        createOperatorProjectDictoryFileType: selectedId_type.value,
      });
      message.success('算子工程创建成功');
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error('创建项目失败');
    }
  };

  // 初始化路径信息
  const initPathInfo = async () => {
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
    selectedId_type,
    projectFormData,
    projectPathOptions: projectPathSearchStrategy.getOptions(),
    projectPathLoading: projectPathSearchStrategy.getLoading(),
    projectSHOptions: projectSHSearchStrategy.getOptions(),
    projectSHLoading: projectSHSearchStrategy.getLoading(),
    remoteSearch,
    handleCreatedProject,
  };
}
