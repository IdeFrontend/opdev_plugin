import NetWork from "../server/NetWork";
import { ExplorerRootUtils } from "./ExplorerRootUtils";
import { CommandExecutor } from './CommandOptions'
import { PermanentStorage } from './PermanentStorage'
import * as vscode from 'vscode';

export default class OpsOption {
    private netWork: NetWork;
    private context: vscode.ExtensionContext
    private storage: PermanentStorage;
    private server: any;
    private project_name: string | undefined;
    private project_path: string | undefined;
    public projectId: string;
    public executor: CommandExecutor;
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.netWork = new NetWork();
        this.projectId = '';
        const selectedFiles = ExplorerRootUtils.getPrimaryRoot();
        this.project_name = selectedFiles?.name;
        this.project_path = selectedFiles?.path;
        this.storage = new PermanentStorage(context);
        this.executor = new CommandExecutor()
    }

    async init(accendEnvScript?: string) {
        this.server = await this.netWork.getServer();
        this.projectId = await this.getProjectId(accendEnvScript)
    }

    async createOps(projectName?: string, projectId?: string, ptototypeName?: string) {
        const op_name = projectName || this.project_name;
        const project_id = projectId || this.projectId;
        const prototype_name = ptototypeName || undefined;
        const result = await this.server.post('api/v1/ops_prototype', {
            op_name, project_id, prototype_name
        })

        if (result.code === 0) {
            vscode.window.showInformationMessage(`新建算子原型文件成功`);
        } else {
            vscode.window.showErrorMessage(`新建算子原型文件失败`);
        }
    }

    async getProjectId(accendEnvScript?: string) {
        const project_name = this.project_name;
        const project_path = this.project_path;
        const ascend_env_script = accendEnvScript || ''
        const projectRes = await this.server.post('api/v1/projects', {
            project_name, project_path, ascend_env_script
        })
        return projectRes.data;
    }

    async createOpsByPrototype(ops_prototype_file: string) {
        const project_id = this.projectId;
        const result = await this.server.post('api/v1/ops', {
            ops_prototype_file, project_id
        })
        console.log({
            ops_prototype_file, project_id
        }, result)
        if (result.code === 0) {
            vscode.window.showInformationMessage(`新建算子文件成功`);
        } else {
            vscode.window.showErrorMessage(`新建算子文件失败`);
        }
    }

    async getConfigData() {
        const project_id = this.projectId;
        const result = await this.server.get(`api/v1/config/build?project_id=${project_id}`)
        console.log(result)
        return result;
    }

    async saveBuildConfig(data: any, showMessage: boolean = true) {
        const result = await this.server.post('api/v1/config/build', data)
        console.log(result)
        if (result.code !== 0) {
            vscode.window.showErrorMessage(`保存编译配置失败`);
        }
        if (!showMessage) {
            return;
        }
        vscode.window.showInformationMessage(`保存编译配置成功`);
    }

    async startBuild(config_id?: string) {
        let configId = config_id
        if (!configId) {
            configId = await this.getBuildConfig()
        }
        const result = await this.server.get(`api/v1/command/get_build_op_command?config_id=${configId}`)
        console.log(`api/v1/command/get_build_op_command?config_id=${config_id}`, result)
        if (result.code !== 0) {
            vscode.window.showErrorMessage(`获取编译算子命令失败`);
            return;
        }
        const res = await this.executor.execute(result.data, [], [], {}, true);
        if (res.code !== 0) {
            vscode.window.showErrorMessage(`编译算子失败 ${res}`);
            return;
        }
        vscode.window.showInformationMessage(`编译算子成功`);
    }

    async startBuildExample(config_id?: string) {
        let configId = config_id
        if (!configId) {
            configId = await this.getBuildExampleConfig()
        }
        const result = await this.server.get(`api/v1/command/get_build_example_command?config_id=${configId}`)
        console.log(`api/v1/command/get_build_example_command?config_id=${config_id}`, result)
        if (result.code !== 0) {
            vscode.window.showErrorMessage(`获取编译example命令失败 ${result}`);
            return;
        }
        const res = await this.executor.execute(result.data, [], [], {}, true);
        if (res.code !== 0) {
            vscode.window.showErrorMessage(`编译example失败`);
            return;
        }
        vscode.window.showInformationMessage(`编译example成功`);
    }

    async getBuildConfig() {
        let buildConfigId = this.storage.get('buildConfigId', '')
        if (!buildConfigId) {
            const res = await this.getConfigData()
            if (res.code !== 0) {
                return buildConfigId
            }
            const configData = res.data;
            buildConfigId = configData.find((v: any) => v.config_type === "build_op").config_id
        }
        return buildConfigId
    }

    async getBuildExampleConfig() {
        let exampleConfigId = this.storage.get('exampleConfigId', '')
        if (!exampleConfigId) {
            const res = await this.getConfigData()
            if (res.code !== 0) {
                return exampleConfigId
            }
            const configData = res.data;
            exampleConfigId = configData.find((v: any) => v.config_type === "build_example").config_id
        }
        return exampleConfigId
    }
}