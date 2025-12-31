/**
 * OpsOption API 辅助模块
 * 用于在 plugin 端直接调用 ops APIs,避免创建 OpsOption 实例
 */
import { opsApis, type OpsApi } from '../apis/ops';
import type {
  InitOpsParams,
  CreateOpsParams,
  CreateOpsByPrototypeParams,
  StartBuildParams,
  StartRunParams,
  StartBuildExampleParams,
  SaveBuildConfigParams,
  SaveConfigParams,
  SaveSanitizerFormParams,
  UpdateShScriptParams,
} from 'shared:/api-types';

// 获取正确类型的 ops API
const ops = opsApis.ops as unknown as OpsApi;

/**
 * OpsAPI 辅助类 - 提供更简洁的调用方式
 */
export class OpsAPI {
  /**
   * 初始化算子项目
   */
  static async init(params: InitOpsParams = {}): Promise<string> {
    return await ops.init(params);
  }

  /**
   * 创建算子原型文件
   */
  static async createOps(params: CreateOpsParams = {}): Promise<string> {
    return await ops.createOps(params);
  }

  /**
   * 通过原型生成算子工程
   */
  static async createOpsByPrototype(opsPrototypeFile: string, opType?: 'ascend' | 'cann'): Promise<void> {
    return await ops.createOpsByPrototype({ opsPrototypeFile, opType });
  }

  /**
   * 获取配置数据
   */
  static async getConfigData() {
    return await ops.getConfigData();
  }

  /**
   * 获取构建配置列表
   */
  static async getBuildConfigs() {
    return await ops.getBuildConfigs();
  }

  /**
   * 保存构建配置
   */
  static async saveBuildConfig(data: any, showMessage: boolean = false): Promise<void> {
    return await ops.saveBuildConfig({ data, showMessage });
  }

  /**
   * 保存配置（仿真/上板）
   */
  static async saveConfig(type: string, data: any, showMessage: boolean = false): Promise<void> {
    return await ops.saveConfig({ type, data, showMessage });
  }

  /**
   * 编译算子
   */
  static async startBuild(configId?: string, compileOption?: string): Promise<void> {
    return await ops.startBuild({ configId, compileOption });
  }

  /**
   * 运行算子
   */
  static async startRun(configId?: string): Promise<void> {
    return await ops.startRun({ configId });
  }

  /**
   * 编译示例
   */
  static async startBuildExample(configId?: string): Promise<void> {
    return await ops.startBuildExample({ configId });
  }

  /**
   * 开始仿真分析
   */
  static async startSimulate(): Promise<void> {
    return await ops.startSimulate();
  }

  /**
   * 开始上板分析
   */
  static async startOnBoard(): Promise<void> {
    return await ops.startOnBoard();
  }

  /**
   * 获取构建配置ID
   */
  static async getBuildConfig() {
    return await ops.getBuildConfig();
  }

  /**
   * 获取示例构建配置ID
   */
  static async getBuildExampleConfig() {
    return await ops.getBuildExampleConfig();
  }

  /**
   * 获取仿真配置ID
   */
  static async getSimulateConfig() {
    return await ops.getSimulateConfig();
  }

  /**
   * 获取上板配置ID
   */
  static async getOnBoardConfig() {
    return await ops.getOnBoardConfig();
  }

  /**
   * 获取异常检测配置列表
   */
  static async getSanitizerConfigs() {
    return await ops.getSanitizerConfigs();
  }

  /**
   * 获取异常检测配置ID
   */
  static async getSanitizerConfigId() {
    return await ops.getSanitizerConfigId();
  }

  /**
   * 保存异常检测表单配置
   */
  static async saveSanitizerForm(data: any, showMessage: boolean = false): Promise<void> {
    return await ops.saveSanitizerForm({ data, showMessage });
  }

  /**
   * 运行异常检测
   */
  static async runSanitizer(): Promise<void> {
    return await ops.runSanitizer();
  }

  /**
   * 更新脚本文件
   */
  static async updateShScript(accendEnvScript?: string): Promise<string> {
    return await ops.updateShScript({ accendEnvScript });
  }

  /**
   * 检查 .vscode 目录
   */
  static async checkVscode(): Promise<boolean> {
    return await ops.checkVscode();
  }

  /**
   * 获取当前 executor
   */
  static getExecutor() {
    return ops.getExecutor();
  }

  /**
   * 清除当前 executor
   */
  static clearExecutor(): void {
    ops.clearExecutor();
  }

  /**
   * 获取当前项目ID
   */
  static getProjectId(): string {
    return ops.getProjectId();
  }
}
