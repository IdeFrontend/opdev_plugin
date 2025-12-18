import { ExplorerRootUtils } from './ExplorerRootUtils';
import { CommandExecutor } from './CommandOptions';
import { PermanentStorage } from './PermanentStorage';
import * as vscode from 'vscode';
import {
  createProject,
  generateOpsPrototype,
  generateStructure,
  getBuildExampleCommand,
  getBuildOpCommand,
  getRunCommand,
  getConfig,
  getFiles,
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

  async init(accendEnvScript?: string, projectPath?: string, projectName?: string) {
    if (projectPath) {
      this.project_path = path.normalize(`${projectPath}/${projectName}`);
    }
    if (projectName) {
      this.project_name = projectName;
    }
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
      return result;
    } catch {
      vscode.window.showErrorMessage(`新建算子原型文件失败`);
      return '';
    }
  }

  async getProjectId(accendEnvScript?: string) {
    const project_name = this.project_name;
    const project_path = this.project_path;
    const ascend_env_script = accendEnvScript || undefined;
    const projectRes = await createProject({ project_name, project_path, ascend_env_script });
    console.log('projectRes', projectRes);
    return String(projectRes);
  }

  // 生成算子工程
  // <<< 算子工程 op_type: 'cann'
  // 右上角 op_type: 'ascend'
  async createOpsByPrototype(ops_prototype_file: string, op_type = 'ascend') {
    const project_id = this.projectId;
    try {
      const result = await generateStructure(
        {
          ops_prototype_file,
          project_id: Number(project_id),
          op_type,
        },
        this.context.extensionPath
      );
      console.log(
        '生成算子工程参数',
        {
          ops_prototype_file,
          project_id,
          op_type,
        },
        result
      );
      vscode.window.showInformationMessage(`新建算子文件成功`);
    } catch (e) {
      vscode.window.showErrorMessage(`新建算子文件失败 ${e instanceof Error ? e.message : ''}`);
    }
  }

  async getConfigData() {
    const buildConfigs = await this.getBuildConfigs();
    console.log('buildConfigs', buildConfigs)
    if (!buildConfigs.length) {
      return {}
    }
    return { [buildConfigs[0].config_name]: buildConfigs };
  }

  async getBuildConfigs() {
    const project_id = this.projectId;
    const array = [getConfig(Number(project_id), 'build_op'), getConfig(Number(project_id), 'build_example'), getConfig(Number(project_id), 'simulate'), getConfig(Number(project_id), 'on_board')]
    const [opConfig, exampleConfig] = await Promise.all(array);
    return [...opConfig, ...exampleConfig];
  }

  async getAllPath(path: string) {
    return getFiles(path);
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

  async saveConfig(type: string, data: any, showMessage: boolean = true) {
      // 仿真/上板保存
      await postConfig(type, data);
      if (!showMessage) {
        vscode.window.showInformationMessage(`保存配置成功`);
      }
  }

  async startBuild(config_id?: string) {
    let configId = config_id;
    if (!configId) {
      configId = await this.getBuildConfig();
    }
    try {
      const buildCommand = await getBuildOpCommand(Number(configId));
      const res = await this.executor.execute(buildCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`编译算子失败 ${res}`);
        return;
      }
      vscode.window.showInformationMessage(`编译算子成功`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`获取编译算子命令失败 ${e.message}`);
    }
  }

  async startRun(config_id?: string) {
    let configId = config_id;
    if (!configId) {
      configId = await this.getBuildExampleConfig();
    }
    try {
      const runCommand = await getRunCommand(Number(configId));
      console.log('runCommand', runCommand)
      const res = await this.executor.execute(runCommand, [], [], {}, true);
      console.log('runRes', res)
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`运行失败 ${res}`);
        return;
      }
      vscode.window.showInformationMessage(`运行成功`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`获取运行命令失败 ${e.message}`);
    }
  }

  async startBuildExample(config_id?: string) {
    let configId = config_id;
    if (!configId) {
      configId = await this.getBuildExampleConfig();
    }
    try {
      const buildCommand = await getBuildExampleCommand(Number(configId));
      const res = await this.executor.execute(buildCommand, [], [], {}, true);
      if (res.code !== 0) {
        vscode.window.showErrorMessage(`编译example失败`);
        return;
      }
      vscode.window.showInformationMessage(`编译example成功`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`获取编译example命令失败 ${e.message}`);
    }
  }

  async getBuildConfig() {
      try {
        const configData = await this.getBuildConfigs();
        console.log('configData in build', configData)
        return configData.find((v: any) => v.config_type === 'build_op')?.config_id;
      } catch {
        return '';
      }
  }

  async getBuildExampleConfig() {
      try {
        const configData = await this.getBuildConfigs();
        console.log('configData in exam', configData)
        return configData.find((v: any) => v.config_type === 'build_example')?.config_id;
      } catch {
        return ''
      }
  }
}
