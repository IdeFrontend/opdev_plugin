import * as vscode from "vscode";
import * as path from "path";
import { getOpRunPath } from "@plugin/domain/utils/op-util";
import {
  joinCommands,
  getExecutableCommand,
  Command,
} from "@plugin/domain/utils/command-utils";
import { ConfigRecord } from "@plugin/domain/models/config-model";
import { OpRecord } from "@plugin/domain/models/model";
import { ProfilerFactory } from "../profiler-service";
import {
  CommandStrategy,
  BaseContext,
  CommandContext,
  CommandBuildParams,
  ProfilerCommandParams,
} from "./types";
import { getConfig, getConfigById } from '../../services/configuration';

/**
 * CANN 类型命令策略
 * CANN (Compute Architecture for Neural Networks) 是华为的AI计算架构
 */
export class CannCommandStrategy implements CommandStrategy {
  buildCommandContext(baseContext: BaseContext): CommandContext {
    const { config, project, operator } = baseContext;

    // CANN 类型使用 ascend_env_script 作为环境脚本
    const sourceCannCmd =
      project && project.ascend_env_script
        ? `. ${project.ascend_env_script}`
        : "";

    let runPath: string;

    if (operator) {
      runPath = getOpRunPath(operator);
    } else {
      // 如果找不到算子，但有配置脚本，使用项目路径作为运行路径
      if (config.script && project) {
        runPath = project.project_path;
      } else {
        throw new Error(`Operator not found: ${config.op}`);
      }
    }

    const cdCmd = `cd ${runPath}`;
    const cdBuildCmd = `mkdir -p  ${runPath}/build && cd ${runPath}/build`;

    return {
      config,
      project,
      operator,
      sourceCannCmd,
      cdCmd,
      cdBuildCmd,
    };
  }

  buildRunCommand(context: CommandContext): string {
    const { config, sourceCannCmd, cdBuildCmd } = context;
    const run_cmd = getExecutableCommand(config.target_file || "", {
      execute: true,
    });

    return joinCommands(sourceCannCmd, cdBuildCmd, run_cmd);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd, operatorNames } = params;

    const scriptField = params.scriptField || 'script'

    const userOptions = config.user_options as Record<string, unknown> | null | undefined;

    if (!userOptions || !userOptions[scriptField]) {
      throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
    }

    const cmd = new Command(userOptions[scriptField] as string);

    if (config.custom_options) {
      cmd.addArgument(config.custom_options);
    }

    // 如果有算子名称，将其作为参数添加到命令中（用于标准自定义算子等场景）
    if (operatorNames) {
      cmd.addArgument(operatorNames);
    }

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildExampleCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd } = params;

    if (!config.script) {
      throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
    }

    const cmd = new Command(config.script || "");

    if (config.custom_options) {
      cmd.addArgument(config.custom_options);
    }

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
    cdBuildCmd?: string,
  ): string {
    const mssanitizer = new Command("mssanitizer");

    // 添加目标文件
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    // 处理配置选项
    const options =
      (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions =
      (options.tool as Record<string, unknown> | undefined) || {};
    const tools = Object.keys(toolOptions).filter((key) => toolOptions[key]);

    mssanitizer.addOption("tool", tools);

    if (toolOptions.memcheck) {
      const memcheckOptions =
        (options.memcheckOption as Record<string, unknown> | undefined) || {};

      Object.keys(memcheckOptions).forEach((key) => {
        if (memcheckOptions[key]) {
          mssanitizer.addOption(key, "yes");
        }
      });
    }

    mssanitizer.addOption("log-level", options.logLevel as string | undefined);
    mssanitizer.addOption(
      "max-debuglog-size",
      options.maxDebuglogSize as string | undefined
    );
    mssanitizer.addOption(
      "block-id",
      options.blockId as string | number | undefined
    );

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const logFilePath = path.join(
      workspacePath,
      '.vscode',
      'mindstudio_sanitizer_log',
      `mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    mssanitizer.addOption('log-file', logFilePath);

    return joinCommands(sourceCannCmd, cdBuildCmd, mssanitizer.toString());
  }

  buildSimulateCommand(params: ProfilerCommandParams): string {
    const {
      config,
      project,
      operator,
      sourceCannCmd,
      cdBuildCmd,
      exampleTargetFile,
    } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(
          `无法生成仿真命令：找不到算子记录 ${config.op}，且项目路径不可用`
        );
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: "cann",
        op_path: project.project_path,
      } as OpRecord;
    }

    const simulatorCmd = ProfilerFactory.getStrategy("simulator").generate(
      config,
      effectiveOperator,
      exampleTargetFile
    );

    return joinCommands(sourceCannCmd, cdBuildCmd, simulatorCmd);
  }

  buildOnBoardCommand(params: ProfilerCommandParams): string {
    const {
      config,
      project,
      operator,
      sourceCannCmd,
      cdBuildCmd,
      exampleTargetFile,
    } = params;

    // 如果找不到算子记录，但有项目路径，创建一个临时算子对象
    let effectiveOperator = operator;

    if (!effectiveOperator) {
      if (!project || !project.project_path) {
        throw new Error(
          `无法生成上板命令：找不到算子记录 ${config.op}，且项目路径不可用`
        );
      }

      // 创建临时算子对象，使用项目路径作为 op_path
      effectiveOperator = {
        id: 0,
        project_id: config.project_id,
        op_name: config.op,
        op_type: "cann",
        op_path: project.project_path,
      } as OpRecord;
    }

    const opprofCmd = ProfilerFactory.getStrategy("onboard").generate(
      config,
      effectiveOperator,
      exampleTargetFile
    );

    return joinCommands(sourceCannCmd, cdBuildCmd, opprofCmd);
  }

  getRunTargetFile(config: ConfigRecord, operator: OpRecord | null): string {
    // CANN 类型：使用 build_op 配置的 target_file
    const buildOpConfigs = getConfig(config.project_id, 'build_op', config.op);
    const buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;
    return buildOpConfig?.target_file || config.target_file || '';
  }

  getProfilerTargetFile(config: ConfigRecord, operator: OpRecord | null, exampleConfigId: number): string {
    // CANN 类型：使用 build_op 配置的 target_file
    const buildOpConfigs = getConfig(config.project_id, 'build_op', config.op);
    const buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;
    return buildOpConfig?.target_file || '';
  }

  buildUtTestCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, advance_cmd, operatorNames } = params;

    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    
    if (!userOptions || !userOptions.script) {
      throw new Error(`配置缺少脚本信息，且找不到算子记录: ${config.op}`);
    }

    let script = userOptions.script as string;
    
    // 替换 {operatorNames} 为传入的算子名称
    if (operatorNames) {
      script = script.replace('{operatorNames}', operatorNames);
    } else {
      script = script.replace('{operatorNames}', '');
    }

    const cmd = new Command(script);

    if (config.custom_options) {
      cmd.addArgument(config.custom_options);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }
}
