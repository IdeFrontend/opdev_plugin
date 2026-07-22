import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { projectService } from '@plugin/service/project-service';
import {
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  CreatedProjectParams,
  OpenProjectParams,
} from '@shared/api-types';
import {
  generateStructure,
  completeProjectConfigs,
} from '@plugin/domain';
import {
  viewIdToProjectType, ensureLaunchJsonExists,
} from '../domain/utils/project-utils';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { configService } from '@plugin/service/config-service';
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  updateStandardCustomOperators,
  appendStandardCustomOperator,
  SubOperatorInfo,
} from '@plugin/domain/models/project-model';
import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { OperatorProjectIconTheme } from '../class/operator-project-icon-theme';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import { getWorkspaceGenOpCommand } from '@plugin/helpers/operator-project-workspace-config';
import {
  buildGenOpCommand, decideSkipFileGeneration,
} from '@plugin/domain/utils/genop-command';
import { COMMAND_CREATE_DIRECTORY } from '@plugin/constants';
import { buildOpenFolderWindowOptions } from '@plugin/helpers/open-folder-window-options';

// Auxiliary function: get extension context
function getExtensionContext(): vscode.ExtensionContext {
  return (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
    .extensionContext;
}

/**
 * Run the configured `build.sh --genop` for a standard-custom sub-operator from the
 * collection root. Returns true only when the command succeeded AND left operator
 * source on disk (skip the plugin's own source generation). Any failure, missing bash,
 * a build.sh without --genop, or an exit-0-but-no-output result returns false → the
 * caller falls back to the template scaffolding (issue #13 behaviour).
 */
async function tryGenOpScaffold(opts: {
  executor: CommandExecutor;
  collectionRoot: string;
  projectPath: string;
  operatorName: string;
  subOpDir: string;
}): Promise<boolean> {
  try {
    const template = getWorkspaceGenOpCommand();

    if (!template.trim()) {
      return false;
    }

    const relativeProjectPath = path.relative(
      opts.collectionRoot,
      opts.projectPath,
    )
      .replace(/\\/g, '/') || '.';
    const command = buildGenOpCommand(template, relativeProjectPath, opts.operatorName);

    vscode.window.showInformationMessage(t('welcome.genopRunning'));

    const result = await opts.executor.execute(
      command,
      [],
      [],
      {
        cwd: opts.collectionRoot,
        toolOutputLabel: 'create',
      },
      true,
    );

    const skip = decideSkipFileGeneration({
      commandSucceeded: result.code === 0,
      opDir: opts.subOpDir,
    });

    if (!skip) {
      vscode.window.showWarningMessage(t('welcome.genopFellBack'));
    }

    return skip;
  }
  catch (error) {
    console.warn(
      'genop scaffold failed, falling back to template scaffolding:',
      error instanceof Error ? error.message : String(error),
    );
    vscode.window.showWarningMessage(t('welcome.genopFellBack'));

    return false;
  }
}

function hasOpenWorkspaceFolder(): boolean {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}

/**
 * When a folder workspace is open, ask current vs new window.
 * With no workspace (empty window), open in the current window without prompting.
 * @returns forceNewWindow for vscode.openFolder, or undefined if the user dismissed the prompt
 */
async function promptForceNewWindowForOpenFolder(): Promise<boolean | undefined> {
  if (!hasOpenWorkspaceFolder()) {
    return false;
  }

  const openCurrent = t('welcome.openInCurrentWindow');
  const openNew = t('welcome.openInNewWindow');
  const choice = await vscode.window.showInformationMessage(
    t('welcome.chooseOpenMode'),
    { modal: true },
    openCurrent,
    openNew,
  );

  if (!choice) {
    return undefined;
  }

  return choice === openNew;
}

async function openFolderFn(url: string) {
  // If the project already exists, open the directory directly
  const localUri = vscode.Uri.file(url);

  const forceNewWindow = await promptForceNewWindowForOpenFolder();

  if (forceNewWindow === undefined) {
    return;
  }

  try {
    await vscode.commands.executeCommand('vscode.openFolder', localUri, buildOpenFolderWindowOptions(forceNewWindow));
    vscode.window.showInformationMessage(t('welcome.openProjectDirSuccess'));
  }
  catch (e) {
    vscode.window.showErrorMessage(t('welcome.openProjectDirFailed', { error: e instanceof Error ? e.message : String(e) }));
  }
}

export const welcomeMethods = {
  /**
   * Create an operator project
   * @param params - parameters
   * @returns results
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    await ProjectManager.getInstance()
      .initProject();

    return await projectService.createOps(params);
  },

  /**
   * Create operators through prototypes
   * @param params - parameters
   */
  async createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void> {
    await ProjectManager.getInstance()
      .initProject();
    await projectService.createOpsByPrototype(params);
  },

  /**
   * Create project (webview/createdProject)
   * @param params - parameters
   */
  async createdProject(params: CreatedProjectParams): Promise<void> {
    try {
      await whenPostActivateBootstrapReady();

      const context = getExtensionContext();

      // Cache projectPath to globalState
      const originalProjectPath = params.projectPath;

      context.globalState.update('lastProjectPath', originalProjectPath);

      vscode.window.showInformationMessage(t('welcome.initializing'));

      const executor = new CommandExecutor();

      const subOpDir = path.join(params.projectPath, params.projectName);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const workspaceProject = workspaceRoot ? getProjectByPath(workspaceRoot) : undefined;
      let currentProjectType = workspaceProject?.project_type;

      if (!currentProjectType && workspaceRoot) {
        const workspaceDetection = await OperatorProjectDetector.detectOperatorProject(workspaceRoot);

        currentProjectType = workspaceDetection.isOperatorProject
          ? workspaceDetection.projectType
          : undefined;
      }

      const isSubOp = isSubOperatorCreation({
        subOpDir,
        workspaceRoot,
        isStandardCustomViewId:
          viewIdToProjectType(params.createOperatorProjectDictoryFileType) === 'ascend',
        currentProjectType,
      });
      // Resolve the collection by the current workspace root (type-agnostic): older
      // standard-custom collection records are stored with project_type 'ascend'.
      let parentCollection = isSubOp && workspaceRoot
        ? getProjectByPath(workspaceRoot)
        : undefined;

      if (isSubOp && workspaceRoot) {
        if (parentCollection) {
          await WorkspaceDetectorService.whenRegistrationReady(workspaceRoot);
        }
        else {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(workspaceRoot);
        }

        parentCollection = getProjectByPath(workspaceRoot);
      }

      let parentProjectId: number | undefined;

      if (isSubOp) {
        if (!parentCollection) {
          throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection is not registered' }));
        }

        const candidateParentProjectId = Number(parentCollection.id);

        if (!Number.isSafeInteger(candidateParentProjectId) || candidateParentProjectId <= 0) {
          throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection has an invalid project id' }));
        }

        parentProjectId = candidateParentProjectId;
      }

      // Issue #14: prefer the project's own `build.sh --genop` to generate sub-operator
      // source. Only attempt it for a sub-operator with a resolved collection.
      let genopSkipFileGeneration = false;

      if (isSubOp && parentCollection && workspaceRoot) {
        genopSkipFileGeneration = await tryGenOpScaffold({
          executor,
          collectionRoot: workspaceRoot,
          projectPath: params.projectPath,
          operatorName: params.projectName,
          subOpDir,
        });
      }

      try {
        // Create the operator directory unless genop already produced it.
        if (!genopSkipFileGeneration && !fs.existsSync(subOpDir)) {
          fs.mkdirSync(subOpDir, { recursive: true });
        }
      }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        throw new Error(t('welcome.createProjectDirFailed', { error: msg }));
      }

      if (params.projectSH) {
        try {
          await executor.execute(`chmod +x ${params.projectSH}`);
          await executor.execute(`${params.projectSH}`);
        }
        catch (error) {
          console.warn(`Failed to execute environment variable script: ${error instanceof Error ? error.message : String(error)}`);
          // Failure to execute the environment variable script does not affect project creation, only warnings are logged
        }
      }

      if (isSubOp) {
        const newSubOperator: SubOperatorInfo = {
          name: params.projectName,
          path: subOpDir,
          isCompiled: false,
        };
        const isExperimental = subOpDir.toLowerCase()
          .includes('experimental');
        const updatedParent = await appendStandardCustomOperator(
          parentCollection!.project_path,
          newSubOperator,
          isExperimental,
        );

        if (!updatedParent) {
          throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection is not registered' }));
        }

        const updatedParentProjectId = Number(updatedParent.id);

        if (!Number.isSafeInteger(updatedParentProjectId) || updatedParentProjectId <= 0) {
          throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection has an invalid project id' }));
        }

        parentCollection = updatedParent;
        parentProjectId = updatedParentProjectId;
        // No projectService.init here: do NOT create a standalone record for the sub-operator.
      }
      else {
        try {
          await projectService.init({
            ascendEnvScript: params.projectSH,
            projectPath: params.projectPath,
            projectName: params.projectName,
            templateName: params.templateName,
            projectType: viewIdToProjectType(params.createOperatorProjectDictoryFileType),
          });
        }
        catch (error) {
          const msg = error instanceof Error ? error.message : String(error);

          throw new Error(t('welcome.initOperatorProjectFailed', { error: msg }));
        }
      }

      try {
        await vscode.commands.executeCommand(
          'revealInExplorer',
          vscode.Uri.file(`${params.projectPath}/${params.projectName}`),
        );
      }
      catch (error) {
        console.warn(`Failed to reveal in explorer: ${error instanceof Error ? error.message : String(error)}`);
        // This failure does not affect project creation, only a warning is logged
      }

      // normalized path
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(
        normalizedProjectPath,
        normalizedProjectName,
      );

      // In a remote environment we can directly open the local path (relative to the remote system)
      const localUri = vscode.Uri.file(fullProjectPath);

      console.log('vscode.openFolder, opening new directory', localUri);

      // Show creation success message
      vscode.window.showInformationMessage(t('welcome.projectCreated', { name: params.projectName }));

      await ensureLaunchJsonExists(fullProjectPath);

      // Save templateName to globalState for subsequent use
      if (params.templateName) {
        context.globalState.update('templateName', params.templateName);
      }

      // Execute the command to create an operator file
      console.log('createdProject: preparing to run create operator file command');
      console.log('createdProject: createOperatorProjectDictoryFileType:', params.createOperatorProjectDictoryFileType);
      console.log('createdProject: templateName:', params.templateName);

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t('welcome.createFilesProgressTitle'),
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 0,
              message: t('welcome.createFilesProgressMessage'),
            });
            console.log(`createdProject: running command ${COMMAND_CREATE_DIRECTORY}`);
            console.log('createdProject: command params:', { createOperatorProjectDirectoryFileType: params.createOperatorProjectDictoryFileType });
            const result = await vscode.commands.executeCommand(
              COMMAND_CREATE_DIRECTORY,
              {
                createOperatorProjectDirectoryFileType:
                  params.createOperatorProjectDictoryFileType,
                ...(isSubOp && parentCollection && parentProjectId !== undefined
                  ? {
                    subOperatorContext: {
                      parentProjectId,
                      opName: params.projectName,
                      outputPath: subOpDir,
                      skipFileGeneration: genopSkipFileGeneration,
                    },
                  }
                  : {}),
              },
              progress,
            );

            console.log('createdProject: command completed, result:', result);
          },
        );
        console.log('createdProject: create operator file command executed successfully');
      }
      catch (error) {
        console.error('createdProject: failed to execute create operator file command:', error);
        console.error('createdProject: error details:', error instanceof Error ? error.stack : String(error));
        // Even if the creation of the operator file fails, the project directory has been created successfully.
        vscode.window.showWarningMessage(t('welcome.createDirOkCreateFilesError', { error: error instanceof Error ? error.message : String(error) }));
      }

      if (isSubOp) {
        // Stay in the collection window: refresh the sidebar and reveal the new operator.
        await requestSidebarContextsRefresh();

        try {
          await vscode.commands.executeCommand('revealInExplorer', localUri);
        }
        catch (error) {
          console.warn(`Failed to reveal in explorer: ${error instanceof Error ? error.message : String(error)}`);
        }

        return;
      }

      const forceNewWindow = await promptForceNewWindowForOpenFolder();

      if (forceNewWindow === undefined) {
        return;
      }

      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, buildOpenFolderWindowOptions(forceNewWindow));
        vscode.window.showInformationMessage(t('welcome.openProjectDirSuccess'));
      }
      catch (e) {
        vscode.window.showErrorMessage(t('welcome.openProjectDirFailed', { error: e instanceof Error ? e.message : String(e) }));
      }
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(t('welcome.createProjectFailed', { error: errorMessage }));
      throw error; // Rethrow the error so that the API server can catch it and return it to the front end
    }
  },

  /**
   * Open the operator project (webview/openProject)
   * @param params - parameters
   */
  async openProject(params: OpenProjectParams, isFromSystem: boolean = false): Promise<void> {
    if (!isFromSystem) {
      await whenPostActivateBootstrapReady();
    }

    try {
      // First check if the project is already in the user's configuration data
      const existingProject = getProjectByPath(params.projectPath);

      if (existingProject) {
        console.log(`[openProject] Project already exists in config: ${existingProject.project_name} (${existingProject.project_path})`);

        // Ensure VS Code-side config files exist for already-registered projects too.
        // Without devtool_config.json, the Operator Development sidebar remains hidden.
        try {
          await ensureLaunchJsonExists(existingProject.project_path);
          console.log('[openProject] Ensured VS Code config files for existing project');
        }
        catch (error) {
          console.warn(`[openProject] Failed to ensure VS Code config files: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Complete missing configs
        try {
          const projectId = existingProject.id;

          await completeProjectConfigs(projectId);
          console.log('[openProject] Config completion finished');
          await configService.maybeMigrateLegacySettingsToWorkspace();
        }
        catch (error) {
          console.warn(`[openProject] Config completion failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (!isFromSystem) {
          await requestSidebarContextsRefresh();
        }

        if (!isFromSystem) {
          openFolderFn(params.projectPath);
        }

        return; // Exit the function and no longer perform subsequent initialization operations
      }

      // If the project does not exist in the configuration, continue with the initialization process
      // If projectName is not provided, extract it from the path
      if (!params.projectName) {
        params.projectName = path.basename(params.projectPath);
        console.log(`[openProject] Project name not provided, extracted from path: ${params.projectName}`);

        // Truncate projectPath, removing project name part
        const dirPath = path.dirname(params.projectPath);

        params.projectPath = dirPath;
        console.log(`[openProject] Updated projectPath (after removing project name): ${params.projectPath}`);
      }

      const context = getExtensionContext();

      const executor = new CommandExecutor();

      // If the system is opened and there is no environment variable script, the environment variable script is set by default.
      if (isFromSystem && !params.projectSH) {
        params.projectSH = '/etc/profile';
      }

      // Handle environment variable configuration script
      if (params.projectSH) {
        try {
          await executor.execute(`chmod +x ${params.projectSH}`);
          await executor.execute(`${params.projectSH}`);
        }
        catch (error) {
          console.warn(`Failed to execute environment variable script: ${error instanceof Error ? error.message : String(error)}`);
          // Failure to execute the environment variable script does not affect project creation, only warnings are logged
        }
      }

      // Detection operator project type
      const projectFullPath = path.join(params.projectPath, params.projectName);
      const rootDetection = await OperatorProjectDetector.detectOperatorProject(projectFullPath);

      // It is detected that the opened directory is not an operator project
      if (!rootDetection.projectType) {
        if (!isFromSystem) {
          openFolderFn(projectFullPath);
        }

        return;
      }

      // Write the configuration to the project.json file
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
          templateName: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
          projectType: viewIdToProjectType(rootDetection.projectType),
        });
      }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        throw new Error(t('welcome.initOperatorProjectFailed', { error: msg }));
      }

      // Process configuration files
      const pm = ProjectManager.getInstance();
      const projectId = Number(pm.projectId);

      await generateStructure(
        {
          ops_prototype_file: '',
          project_id: projectId,
          // op_type from detection (ascend, cann, pyasc, triton, …)
          op_type: viewIdToProjectType(rootDetection.projectType),
          template_name: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
        },
        context.extensionPath,
        true,
      );
      await pm.checkVscode();
      await configService.maybeMigrateLegacySettingsToWorkspace();

      if (!isFromSystem) {
        await requestSidebarContextsRefresh();
      }

      if (!isFromSystem) {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      // If it is a standard custom operator, scan the operator collection and operator and update the root project (do not create a new projects item for it)
      if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
        try {
          console.log('[openProject] Standard custom operators detected, scanning operator groups and operators...');
          const {
            opsMeet, opsList, experimentalOpsList,
          } = WorkspaceDetectorService.scanOpsMeetAndOpsLists(projectFullPath);

          console.log(`[openProject] Operator group list: ${opsMeet.map((m) => m.name)
            .join(', ')}`);
          console.log(`[openProject] Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`);
          await updateStandardCustomOperators(projectFullPath, opsMeet, opsList, experimentalOpsList);
          console.log(`[openProject] Stored ${opsMeet.length} operator groups, ${opsList.length} regular operators, and ${experimentalOpsList.length} experimental operators`);
        }
        catch (error) {
          console.warn(`[openProject] Failed to detect operator info: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // normalized path
      const normalizedProjectPath = path.normalize(params.projectPath);
      const normalizedProjectName = path.normalize(params.projectName);
      const fullProjectPath = path.join(normalizedProjectPath, normalizedProjectName);

      if (isFromSystem) {
        // To open the operator project at the system level, just refresh the folder decoration
        const iconTheme = OperatorProjectIconTheme.getInstance(context);

        iconTheme.fireDecorationUpdate();
      }
      else {
        // Open the operator project by opening the page
        openFolderFn(fullProjectPath);
      }
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      vscode.window.showErrorMessage(t('welcome.openProjectFailed', { error: errorMessage }));
      throw error;
    }
  },
};
