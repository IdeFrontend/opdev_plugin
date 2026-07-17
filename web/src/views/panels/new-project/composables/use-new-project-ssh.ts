import {
  ref, reactive, onBeforeUnmount, onMounted, type Ref, type VNodeRef,
} from 'vue';
import { message } from 'ant-design-vue';
import type { FormInstance as AntdVForm } from 'ant-design-vue';
import {
  createdProject,
  getHome,
  getLastProjectPath,
  getProjectTypeSupportEnabled,
  getWorkspace,
} from '@web/apis';
import {
  selectFolder, selectFile,
} from '@web/apis/performance-run-data';
import { t } from 'i18next';
import {
  OperatorProjectViewId, type OperatorProjectViewIdValue,
} from '@shared/project-type-view-id';
import { ValidationStrategyFactory } from './validation-strategies';
import { MessageHandlerStrategyManager } from './message-handler-strategies';
import { SearchStrategyFactory } from './search-strategies';
import { ProjectNameFactory } from './project-name-factory';

export const ensureExperimentalInPath = (currentPath: string): string => {
  if (!currentPath) {
    return currentPath;
  }

  const normalized = currentPath.replace(/\\/g, '/')
    .toLowerCase();

  if (!normalized.includes('/experimental')) {
    return currentPath.endsWith('/') || currentPath.endsWith('\\')
      ? `${currentPath}experimental`
      : `${currentPath}/experimental`;
  }

  return currentPath;
};

function resolveAntdFormRef(refValue: unknown): AntdVForm | null {
  if (refValue && typeof refValue === 'object' && 'validate' in refValue) {
    return refValue as AntdVForm;
  }

  return null;
}

export function useNewProjectSSH(selectedTemplate?: Ref<'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add'>) {
  const connectionFormRef = ref<AntdVForm | null>(null);
  const selectedId_type = ref<OperatorProjectViewIdValue>(OperatorProjectViewId.CANN);

  const isPathSetFromContextMenu = ref(false);
  const workspacePath = ref<string | null>(null);
  const homePath = ref<string | null>(null);

  const projectPathSearchStrategy =
    SearchStrategyFactory.getStrategy('projectPath');
  const projectSHSearchStrategy =
    SearchStrategyFactory.getStrategy('projectSH');

  const messageHandlerManager = new MessageHandlerStrategyManager();

  const projectFormData = reactive({
    projectPath: '/home/developer',
    projectName: ProjectNameFactory.generateDefaultProjectName(),
    projectSH: '/etc/profile',
  });

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

  const messageHandler = (event: MessageEvent) => {
    handleRemoteSearchResult(event);

    const messageData = event.data;
    const context = {
      homePath,
      workspacePath,
      projectPath: projectFormData,
      isPathSetFromContextMenu,
    };

    const isPathInitCommand =
      messageData?.command === 'iframeSetHome'
      || messageData?.command === 'iframeSetWorkspace'
      || messageData?.command === 'iframeSetLastProjectPath'
      || messageData?.command === 'iframeSetProjectPath';

    const prevPath = projectFormData.projectPath;

    messageHandlerManager.handle(messageData, context);
    const pathChanged = prevPath !== projectFormData.projectPath;

    if (
      isPathInitCommand
      && pathChanged
      && selectedId_type.value === OperatorProjectViewId.STANDARD_CUSTOM
      && projectFormData.projectPath
    ) {
      const updated = ensureExperimentalInPath(projectFormData.projectPath);

      if (updated !== projectFormData.projectPath) {
        projectFormData.projectPath = updated;
      }
    }
  };

  const remoteSearch = async (
    type: 'projectPath' | 'projectSH',
    keyword: string,
  ) => {
    const strategy = SearchStrategyFactory.getStrategy(type);

    await strategy.search(keyword);
  };

  const getTemplateName = (template: 'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add' | undefined): string | undefined => {
    if (!template) {
      return undefined;
    }

    const mapping: Record<'helloworld' | 'addn' | 'torch_library_template' | 'triton_vector_add', string> = {
      helloworld: 'hello_world',
      addn: 'addn_custom',
      torch_library_template: 'torch_library_template',
      triton_vector_add: 'triton_vector_add',
    };

    return mapping[template];
  };

  const resolveTemplateNameByProjectType = (): string | undefined => {
    if (selectedId_type.value === OperatorProjectViewId.CANN) {
      return selectedTemplate?.value
        ? getTemplateName(selectedTemplate.value)
        : undefined;
    }

    if (selectedId_type.value === OperatorProjectViewId.TRITON) {
      return 'triton_vector_add';
    }

    return undefined;
  };

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await selectFolder({ defaultPath: projectFormData.projectPath });

      if (selectedPath) {
        projectFormData.projectPath = selectedPath;
      }
    }
    catch (error) {
      console.error('选择目录失败:', error);
      message.error(t('web.link.selectFolderFailed'));
    }
  };

  const handleSelectFile = async () => {
    try {
      const selectedPath = await selectFile({ defaultPath: projectFormData.projectSH });

      if (selectedPath) {
        projectFormData.projectSH = selectedPath;
      }
    }
    catch (error) {
      console.error('选择文件失败:', error);
      message.error(t('web.link.selectFileFailed'));
    }
  };

  const setConnectionFormRef: VNodeRef = (el) => {
    connectionFormRef.value = resolveAntdFormRef(el);
  };

  const handleCreatedProject = async () => {
    const form = resolveAntdFormRef(connectionFormRef.value);

    if (!form) {
      return;
    }

    try {
      await form.validate();
    }
    catch {
      return;
    }

    if (
      !ValidationStrategyFactory.validateProjectName(projectFormData.projectName)
    ) {
      return;
    }

    try {
      const templateName = resolveTemplateNameByProjectType();

      await createdProject({
        ...projectFormData,
        createOperatorProjectDictoryFileType: selectedId_type.value,
        templateName,
      });
      message.success(t('web.link.projectCreated'));
    }
    catch (error) {
      console.error('创建项目失败:', error);
      message.error(t('web.link.projectCreateFailed'));
    }
  };

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

  const initFeatureToggles = async () => {
    try {
      const tritonEnabled = await getProjectTypeSupportEnabled(OperatorProjectViewId.TRITON);

      if (!tritonEnabled && selectedId_type.value === OperatorProjectViewId.TRITON) {
        selectedId_type.value = OperatorProjectViewId.CANN;
      }
    }
    catch (error) {
      console.error('[Link] Failed to read project type support setting:', error);

      if (selectedId_type.value === OperatorProjectViewId.TRITON) {
        selectedId_type.value = OperatorProjectViewId.CANN;
      }
    }
  };

  onMounted(() => {
    window.addEventListener('message', messageHandler);
    void initFeatureToggles();
    initPathInfo();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('message', messageHandler);
  });

  return {
    connectionFormRef,
    setConnectionFormRef,
    selectedId_type,
    projectFormData,
    projectPathOptions: projectPathSearchStrategy.getOptions(),
    projectPathLoading: projectPathSearchStrategy.getLoading(),
    projectSHOptions: projectSHSearchStrategy.getOptions(),
    projectSHLoading: projectSHSearchStrategy.getLoading(),
    remoteSearch,
    handleSelectFolder,
    handleSelectFile,
    handleCreatedProject,
  };
}
