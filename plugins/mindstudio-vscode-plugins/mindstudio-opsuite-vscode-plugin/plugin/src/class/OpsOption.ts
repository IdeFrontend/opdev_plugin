import { ExplorerRootUtils } from './ExplorerRootUtils';
import { CommandExecutor } from './CommandOptions';
import { PermanentStorage } from './PermanentStorage';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  createProject,
  updataShScript,
  generateOpsPrototype,
  generateStructure,
  getBuildExampleCommand,
  getSimulateCommand,
  getOnBoardCommand,
  getBuildOpCommand,
  getRunCommand,
  getSanitizerCommand,
  getConfig,
  postConfig,
} from '../../autogen-server';
import path from 'node:path';

export default class OpsOption {
  private storage: PermanentStorage;
  private project_name: string | undefined;
  private project_path: string | undefined;
  public projectId: string;
  public executor: CommandExecutor;
  constructor(private context: vscode.ExtensionContext) {
    this.projectId = '';
    const selectedFiles = ExplorerRootUtils.getPrimaryRoot();
    this.project_name = selectedFiles?.name;
    this.project_path = selectedFiles?.path;
    this.storage = new PermanentStorage(context);
    this.executor = new CommandExecutor();
  }

  /**
   * 检查当前工作区是否存在 .vscode/devtool_config.json 文件
   * @returns 如果文件存在返回 true，否则返回 false
   */
  async checkVscode(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const vscodePath = path.join(workspacePath, '.vscode');
    console.log('vscodePath', vscodePath);
    if (fs.existsSync(vscodePath)) {
      const commandExecutor = new CommandExecutor();
      console.log(`chmod 750 ${vscodePath}`);
      await commandExecutor.execute(`chmod 750 ${vscodePath}`, [], [], {});
    }
    return false;
  }

  async init(accendEnvScript?: string, projectPath?: string, projectName?: string) {
    if (projectPath) {
      this.project_path = path.normalize(`${projectPath}/${projectName}`);
    }
    if (projectName) {
      this.project_name = projectName;
    }
    console.log('accendEnvScript:', accendEnvScript);
    this.projectId = await this.getProjectId(accendEnvScript);
  }

  // 创建算子原型文件
  // 标准自定义算子工程 使用原型模板
  async createOps(projectName?: string, projectId?: string, ptototypeName?: string): Promise<string> {
    const op_name = projectName || this.project_name;
    const project_id = projectId || this.projectId;
    const prototype_name = ptototypeName || undefined;
    console.log('生成算子原型文件参数', op_name, project_id, prototype_name);
    try {
      const result = await generateOpsPrototype(Number(project_id), op_name, prototype_name, this.context.extensionPath);
      vscode.window.showInformationMessage(`新建算子原型文件成功`);
      await this.checkVscode();
      return result;
    } catch {
      vscode.window.showErrorMessage(`新建算子原型文件失败`);
      return '';
    }
  }

  async getProjectId(accendEnvScript?: string) {
    const project_name = this.project_name ?? '';
    const project_path = this.project_path;
    if (project_path === undefined) {
      return '';
    }
    const ascend_env_script = accendEnvScript || undefined;
    const projectRes = await createProject({ project_name, project_path, ascend_env_script });
    console.log('projectRes', projectRes);
    return String(projectRes);
  }

  async updataShScript(accendEnvScript?: string) {
    const project_name = this.project_name ?? '';
    const project_path = this.project_path;
    if (project_path === undefined) {
      return '';
    }
    const ascend_env_script = accendEnvScript || undefined;
    const projectRes = await updataShScript({ project_name, project_path, ascend_env_script });
    console.log('projectRes', projectRes);
    return String(projectRes);
  }

  // 生成算子工程
  // <<< 算子工程 op_type: 'cann'
  // 右上角 op_type: 'ascend'
  async createOpsByPrototype(ops_prototype_file: string, op_type = 'ascend', progress?: any) {
    const project_id = this.projectId;
    try {
      progress?.report({ increment: 70, message: '算子文件创建中...' });
      const result = await generateStructure(
        {
          ops_prototype_file,
          project_id: Number(project_id),
          op_type,
        },
        this.context.extensionPath,
      );
      console.log(
        '生成算子工程参数',
        {
          ops_prototype_file,
          project_id,
          op_type,
        },
        result,
      );
      vscode.window.showInformationMessage(`新建算子文件成功`);
      await this.checkVscode()
    } catch (e) {
      vscode.window.showErrorMessage(`新建算子文件失败 ${e instanceof Error ? e.message : ''}`);
    }
  }

  async getConfigData() {
    const buildConfigs = await this.getBuildConfigs();
    console.log('buildConfigs', buildConfigs);
    if (!buildConfigs.length) {
      return {};
    }
    return { [buildConfigs[0].config_name]: buildConfigs };
  }

  async getBuildConfigs() {
    const project_id = this.projectId;
    const array = [
      getConfig(Number(project_id), 'build_op'),
      getConfig(Number(project_id), 'build_example'),
      getConfig(Number(project_id), 'simulate'),
      getConfig(Number(project_id), 'on_board'),
    ];
    const [opConfig, exampleConfig, simulateConfig, onBoardConfig] = await Promise.all(array);
    return [...opConfig, ...exampleConfig, ...simulateConfig, ...onBoardConfig];
  }

  async saveBuildConfig(data: any, showMessage: boolean = true) {
    try {
      await postConfig('build', data);
      if (!showMessage) {
        return;
      }
      vscode.window.showInformationMessage(`保存编译配置成功`);
    } catch {
      vscode.window.showErrorMessage(`保存编译配置失败`);
    }
  }

  async saveConfig(type: string, data: any, showMessage: boolean = false) {
    // 仿真/上板保存
    await postConfig(type, data);
    if (showMessage) {
      vscode.window.showInformationMessage(`保存配置成功`);
    }
  }

  /**
   * 编译部署算子
   * @param config_id 配置Id
   * @param compileOption 编译参数 --debug: debug模式 ；  --mssanitizer: 异常检测模式
   */
  async startBuild(config_id?: string, compileOption?: string) {
    const configId = config_id ? Number(config_id) : await this.getBuildConfig();
    try {
      const buildCommand = await getBuildOpCommand(Number(configId), compileOption);
      const res = await this.executor.execute(buildCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${res.output}`);
        return;
      }
      vscode.window.showInformationMessage(`编译算子成功`);
    } catch (e) {
      vscode.window.showErrorMessage(`获取编译算子命令失败 ${(e as Error).message}`);
    }
  }

  async startRun(config_id?: string) {
    const configId = config_id ? Number(config_id) : await this.getBuildExampleConfig();
    try {
      const runCommand = await getRunCommand(Number(configId));
      console.log('runCommand', runCommand);
      const res = await this.executor.execute(runCommand, [], [], {}, true);
      console.log('runRes', res);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`运行失败 ${res.output}`);
        return;
      }
      vscode.window.showInformationMessage(`运行成功`);
    } catch (e) {
      vscode.window.showErrorMessage(`获取运行命令失败 ${(e as Error).message}`);
    }
  }

  async startBuildExample(config_id?: string) {
    const configId = config_id ? Number(config_id) : await this.getBuildExampleConfig();
    try {
      const buildCommand = await getBuildExampleCommand(Number(configId));
      const res = await this.executor.execute(buildCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`编译example失败`);
        return;
      }
      vscode.window.showInformationMessage(`编译example成功`);
    } catch (e) {
      vscode.window.showErrorMessage(`获取编译example命令失败 ${(e as Error).message}`);
    }
  }

  async startSimulate() {
    const configId = await this.getSimulateConfig();
    const exConfigId = await this.getBuildExampleConfig();
    console.log('simulate configId', configId, exConfigId);
    try {
      const simulateCommand = await getSimulateCommand(Number(configId), Number(exConfigId));
      console.log('simulateCommand', simulateCommand);
      const res = await this.executor.execute(simulateCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`执行仿真分析失败`);
        return;
      }
      vscode.window.showInformationMessage(`执行仿真分析成功`);
      vscode.commands.executeCommand('performanceSidebarView.focus');
    } catch (e: any) {
      vscode.window.showErrorMessage(`获取仿真命令失败 ${e.message}`);
    }
  }

  async startOnBoard() {
    const configId = await this.getOnBoardConfig();
    const exConfigId = await this.getBuildExampleConfig();
    console.log('onboard configId', configId, exConfigId);
    try {
      const onBoardCommand = await getOnBoardCommand(Number(configId), Number(exConfigId));
      console.log('onBoardCommand', onBoardCommand);
      const res = await this.executor.execute(onBoardCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`执行上板分析失败`);
        console.log('res.code', res)
        vscode.commands.executeCommand('performanceSidebarView.focus');
        return;
      }
      console.log('aaa')
      vscode.window.showInformationMessage(`执行上板分析成功`);
      console.log('sss')
      vscode.commands.executeCommand('performanceSidebarView.focus');
      console.log('ddd')
    } catch (e: any) {
      console.log('qqq')
      vscode.window.showErrorMessage(`获取上板命令失败 ${e.message}`);
      console.log('www')
      vscode.commands.executeCommand('performanceSidebarView.focus');
      console.log('eee')
    }
  }

  async getBuildConfig() {
    try {
      const configData = await this.getBuildConfigs();
      console.log('configData in build', configData);
      return configData.find((v) => v.config_type === 'build_op')?.config_id;
    } catch {
      return undefined;
    }
  }

  async getBuildExampleConfig() {
    try {
      const configData = await this.getBuildConfigs();
      console.log('configData in exam', configData);
      return configData.find((v) => v.config_type === 'build_example')?.config_id;
    } catch {
      return undefined;
    }
  }

  async getSimulateConfig() {
    try {
      const configData = await this.getBuildConfigs();
      console.log('configData in simulate', configData);
      return configData.find((v: any) => v.config_type === 'simulate')?.config_id;
    } catch {
      return '';
    }
  }

  async getOnBoardConfig() {
    try {
      const configData = await this.getBuildConfigs();
      console.log('configData in onBoard', configData);
      return configData.find((v: any) => v.config_type === 'on_board')?.config_id;
    } catch {
      return '';
    }
  }

  async getSanitizerConfigs() {
    const project_id = this.projectId;
    const config = await getConfig(Number(project_id), 'sanitizer');
    return [...config];
  }
  async getSanitizerConfigId() {
    try {
      const configData = await this.getSanitizerConfigs();
      console.log('configData in build', configData);
      return configData.find((v: any) => v.config_type === 'sanitizer')?.config_id;
    } catch {
      return undefined;
    }
  }
  async saveSanitizerForm(data: any, showMessage: boolean = true) {
    try {
      const formData = (await this.getSanitizerConfigs())[0];
      await postConfig('sanitizer', [{ ...formData, user_options: { ...formData.user_options, ...data } }]);
      if (!showMessage) {
        return;
      }
      vscode.window.showInformationMessage(`保存编译配置成功`);
    } catch {
      vscode.window.showErrorMessage(`保存编译配置失败`);
    }
  }

  // 开启异常检测
  async runSanitizer() {
    try {
      let sanitizerConfigId: Number | undefined;
      let exampleConfigId: Number | undefined | string;
      if (!sanitizerConfigId) {
        sanitizerConfigId = await this.getSanitizerConfigId();
      }
      if (!exampleConfigId) {
        exampleConfigId = await this.getBuildExampleConfig();
      }

      const sanitizerCommand = (await getSanitizerCommand(Number(sanitizerConfigId), Number(exampleConfigId))) || '';
      const res = await this.executor.execute(sanitizerCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`异常检测失败 ${res.output}`);
        return;
      }
      vscode.window.showInformationMessage(`异常检测成功`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`获取异常检测命令失败 ${e.message}`);
    }
  }
}
