import { t } from 'i18next';
import * as vscode from 'vscode';
import * as path from 'path';
import { sanitizerTargetKeyForOp } from '@plugin/domain/models/op-record';
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
  viewIdToProjectType, ensureLaunchJsonExists,
} from '../domain/utils/project-utils';
import { requestSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { ConfigService } from '@plugin/service/config-service';
import {
  OperatorProjectDetector,
  OperatorProjectType,
} from '@plugin/domain/services/operator-project-detector';
import {
  getProjectByPath,
  normalizeProjectPath,
  type SubOperatorInfo,
} from '@plugin/domain/models/project-model';
import {
  appendOperatorToFolderScanState,
  readWorkspaceCache,
  updateFolderScanState,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { OperatorProjectIconTheme } from '../class/operator-project-icon-theme';
import { whenPostActivateBootstrapReady } from '@plugin/helpers/post-activate-bootstrap';
import {
  getWorkspaceGenOpCommand,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
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
 * caller falls back to the template scaffolding.
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

/**
 * Ensure the VS Code-side config files (devtool_config.json etc.) and the
 * default op-devtools settings seed exist for a project. Each step is
 * best-effort: failures are logged and swallowed so the open flow proceeds.
 */
async function ensureProjectIdeConfigAndSettings(
  projectPath: string,
  opts: { ascendEnvScript?: string;
    projectType?: string;
    templateName?: string },
): Promise<void> {
  try {
    await ensureLaunchJsonExists(projectPath);
  }
  catch (error) {
    console.warn(`[openProject] Failed to ensure VS Code config files: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(
      projectPath,
      opts.ascendEnvScript,
      opts.projectType,
      undefined,
      opts.templateName ?? '',
    );
    console.log('[openProject] Settings seeding finished');
  }
  catch (error) {
    console.warn(`[openProject] Settings seeding failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const welcomeMethods = {
  /**
   * Create an operator project
   * @param params - parameters
   * @returns results
   */
  async createOps(params: CreateOpsParams): Promise<string> {
    return await projectService.createOps(params);
  },

  /**
   * Create operators through prototypes
   * @param params - parameters
   */
  async createOpsByPrototype(params: CreateOpsByPrototypeParams): Promise<void> {
    // The structure comes from OpGeneratorFactory and the default settings from
    // ConfigService.ensureOpDevtoolsSettingsSeeded.
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

      vscode.window.showInformationMessage(t('welcome.initializing'));

      const executor = new CommandExecutor();

      const subOpDir = path.join(params.projectPath, params.projectName);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const workspaceProject = workspaceRoot ? getProjectByPath(workspaceRoot) : undefined;
      // Cascade: workspace `projectType` setting → DB record → detection.
      let currentProjectType = workspaceRoot
        ? readWorkspaceProjectTypeSetting(vscode.Uri.file(workspaceRoot))
        : undefined;

      if (!currentProjectType) {
        currentProjectType = workspaceProject?.project_type ?? undefined;
      }

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

      if (isSubOp && !parentCollection) {
        throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection is not registered' }));
      }

      // Prefer the project's own `build.sh --genop` to generate sub-operator
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
        // Append to the collection scan state in the workspace cache
        // (no projects.json registry — the cache is the collection store).
        // The collection is registered only when its scan state exists under
        // cache.folders[rootKey].
        const parentPath = parentCollection!.project_path;
        const rootKey = normalizeProjectPath(parentPath);
        const scanState = readWorkspaceCache(parentPath).folders?.[rootKey];

        if (!scanState) {
          throw new Error(t('welcome.initOperatorProjectFailed', { error: 'standard-custom collection is not registered' }));
        }

        const nextScanState = appendOperatorToFolderScanState(scanState, newSubOperator, isExperimental);

        await updateWorkspaceCache(parentPath, (cache) => {
          cache.folders = {
            ...(cache.folders ?? {}),
            [rootKey]: nextScanState,
          };
          // 自动选中新创建的子算子，并去除其它已选算子（issue #83）。
          // selectedOperatorPaths 以 PATHS 形式持久化，与 scan state 中
          // newSubOperator.path 同源，home-controller 的 projectPathsEqual 可匹配。
          cache.project = {
            ...(cache.project ?? {}),
            selectedOperatorPaths: [subOpDir],
          };
        });
        // No projectService.init here: do NOT create a standalone record for the sub-operator.
      }
      else {
        try {
          await projectService.init({
            ascendEnvScript: params.projectSH,
            projectPath: params.projectPath,
            projectName: params.projectName,
            templateName: params.templateName,
            // Persist the canonical creation type in init.
            projectType: viewIdToProjectType(params.createOperatorProjectDictoryFileType),
          });
        }
        catch (error) {
          const msg = error instanceof Error ? error.message : String(error);

          throw new Error(t('welcome.initOperatorProjectFailed', { error: msg }));
        }

        // A plugin-created standard-custom collection must be registered in the
        // workspace cache scan state (cache.folders[rootKey]) right away: the
        // sub-operator creation flow below reads it. Create-if-missing — scan
        // state from an earlier scan is never clobbered.
        if (viewIdToProjectType(params.createOperatorProjectDictoryFileType) === 'ascend') {
          const collectionPath = path.join(params.projectPath, params.projectName);
          const rootKey = normalizeProjectPath(collectionPath);

          await updateWorkspaceCache(collectionPath, (cache) => {
            if (!cache.folders?.[rootKey]) {
              cache.folders = {
                ...(cache.folders ?? {}),
                [rootKey]: {
                  opsMeet: [],
                  opsList: [],
                  experimentalOpsList: [],
                },
              };
            }
          });
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

      // Seed the sanitizer Python target for single-operator python
      // types (pyasc/triton) — the default `targetOpFile` (`python3 ./<op>.py`)
      // — and the torch-library target ('python ../run.py', the generated
      // build_op target). So a fresh creation produces the sanitizer command
      // without an active-file sync. Keyed by the canonical operator name via
      // sanitizerTargetKeyForOp (the operator dir basename on creation), the
      // same key the runtime reader resolves.
      const projectType = viewIdToProjectType(params.createOperatorProjectDictoryFileType);

      if (projectType === 'pyasc' || projectType === 'triton' || params.templateName === 'torch_library_template') {
        await updateWorkspaceCache(fullProjectPath, (cache) => {
          cache.sanitizerPythonTarget = {
            ...(cache.sanitizerPythonTarget ?? {}),
            [sanitizerTargetKeyForOp(fullProjectPath, '')]:
              params.templateName === 'torch_library_template'
                ? 'python ../run.py'
                : `python3 ./${params.projectName}.py`,
          };
        });
      }

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
                ...(isSubOp && parentCollection
                  ? {
                    subOperatorContext: {
                      parentProjectPath: parentCollection.project_path,
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
        await ensureProjectIdeConfigAndSettings(existingProject.project_path, { templateName: existingProject.template_name ?? '' });
        console.log('[openProject] Ensured VS Code config files for existing project');

        // Materialize default build settings if missing. The seed is per-key
        // create-if-missing, and the synthesized record carries the template
        // name so torch_library projects get the 'python ../run.py' target.
        // Write the stored project_type back into the setting; a failure
        // surfaces the same seeding-failed warning as the seed itself.
        try {
          if (existingProject.project_type) {
            await ConfigService.writeOpDevtoolsDottedSettings(
              { projectType: existingProject.project_type },
              existingProject.project_path,
            );
          }
        }
        catch (error) {
          console.warn(`[openProject] Settings seeding failed: ${error instanceof Error ? error.message : String(error)}`);
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

      // Write the configuration to the workspace settings (the canonical
      // detector type, not the viewIdToProjectType remap — a standard-custom
      // collection keeps 'standard-custom').
      try {
        await projectService.init({
          ascendEnvScript: params.projectSH,
          projectPath: params.projectPath,
          projectName: params.projectName,
          templateName: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
          projectType: rootDetection.projectType,
        });
      }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        throw new Error(t('welcome.initOperatorProjectFailed', { error: msg }));
      }

      // Process configuration files: the structure was already generated by
      // createOpsByPrototype during the creation flow (no generator call
      // here); only the VS Code side files and the default settings seeding
      // are ensured. The seeding is idempotent (skipped when compileCommand
      // already exists). The seed's op_type comes from detection (ascend-c,
      // cann, pyasc, triton, standard-custom, …); torch_library carries the
      // template name so the seed writes 'python ../run.py' for build_op.
      const pm = ProjectManager.getInstance();

      await ensureProjectIdeConfigAndSettings(projectFullPath, {
        ascendEnvScript: params.projectSH ?? '',
        projectType: rootDetection.projectType,
        templateName: rootDetection.projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
      });

      await pm.checkVscode();

      if (!isFromSystem) {
        await requestSidebarContextsRefresh();
      }

      if (!isFromSystem) {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      // If it is a standard custom operator, scan the operator collection and operator
      // and persist the scan state into the workspace cache (do not create a new projects item for it)
      if (rootDetection.projectType === OperatorProjectType.STANDARD_CUSTOM) {
        try {
          console.log('[openProject] Standard custom operators detected, scanning operator groups and operators...');
          const {
            opsMeet, opsList, experimentalOpsList,
          } = WorkspaceDetectorService.scanOpsMeetAndOpsLists(projectFullPath);

          console.log(`[openProject] Operator group list: ${opsMeet.map((m) => m.name)
            .join(', ')}`);
          console.log(`[openProject] Regular operators: ${opsList.length}, experimental operators: ${experimentalOpsList.length}`);
          await updateFolderScanState(projectFullPath, {
            opsMeet,
            opsList,
            experimentalOpsList,
          });
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
