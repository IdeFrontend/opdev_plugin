/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { t } from 'i18next';
import {
  joinCommands,
  Command,
} from '@plugin/domain/utils/command-utils';
import type {
  BuildOpConfig,
  BuildExampleConfig,
  UtTestConfig,
  SanitizerConfig,
} from '@plugin/service/config-service';
import {
  OpRecord,
  resolveFallbackOperatorName,
} from '@plugin/domain/models/op-record';
import {
  CommandStrategy,
  CommandContext,
  CommandBuildParams,
  ProfilerTargetConfig,
} from './types';
import {
  getPythonRunTargetFile,
  normalizePythonCommandInterpreter,
  quoteShellTokenIfNeeded,
  resolvePythonExecutablePath,
} from './python-operator-strategy-shared';
import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import { BasePythonCommandStrategy } from './base-python-strategy';
import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import {
  normalizeBlockId,
  normalizeLogLevel,
  normalizeMaxDebuglogSize,
  addSanitizerToolOptions,
  normalizeSanitizerCommand,
  buildSanitizerLogFilePath,
  createSanitizerCommand,
} from './sanitizer-option-guards';

/**
 * Verifies the resolved interpreter can import PyTorch and Triton (typical Triton operator workspace).
 */
interface TritonProbeResult {
  ok: boolean;
  interpreter: string;
  stderr: string;
}

const TRITON_PROBE_IMPORT = 'import torch; import triton';

/** Build spawn target for the Triton import probe (exported for unit tests). */
export function buildTritonProbeSpawnSpec(): { interpreter: string;
  file: string;
  args: string[] } {
  const interpreter = resolvePythonExecutablePath();
  const pythonImport = `${quoteShellTokenIfNeeded(interpreter)} -c '${TRITON_PROBE_IMPORT}'`;

  if (process.platform === 'win32') {
    return {
      interpreter,
      file: interpreter,
      args: [
        '-c',
        TRITON_PROBE_IMPORT,
      ],
    };
  }

  const envScript = getEnvironmentScriptPathFromWorkspace();
  const shellCommand = joinCommands(
    envScript ? `. ${quoteShellTokenIfNeeded(envScript)}` : '',
    pythonImport,
  );

  return {
    interpreter,
    file: 'bash',
    args: [
      '-lc',
      shellCommand,
    ],
  };
}

export function probeTritonPythonDependencies(): Promise<TritonProbeResult> {
  const {
    interpreter, file, args,
  } = buildTritonProbeSpawnSpec();

  return new Promise((resolve) => {
    let output = '';
    let settled = false;

    const finish = (result: TritonProbeResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const capture = (chunk: Buffer | string): void => {
      // Cap the buffer so a noisy interpreter cannot grow the string without bound.
      if (output.length < 512 * 1024) {
        output += chunk.toString();
      }
    };

    // spawn (async) instead of spawnSync so importing torch/triton on a cold cache
    // does not block the extension host event loop for up to the timeout.
    const child = spawn(file, args, { windowsHide: true });

    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        interpreter,
        stderr: [
          output.trim(),
          'Timed out after 25s',
        ].filter(Boolean)
          .join('\n'),
      });
    }, 25_000);

    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.on('error', (err) => {
      finish({
        ok: false,
        interpreter,
        stderr: [
          output.trim(),
          err.message,
        ].filter(Boolean)
          .join('\n'),
      });
    });
    child.on('close', (code) => {
      finish(code === 0
        ? {
          ok: true,
          interpreter,
          stderr: '',
        }
        : {
          ok: false,
          interpreter,
          stderr: output.trim(),
        });
    });
  });
}

/** The sanitizer tool keys the section DAO carries (a truthy subset feeds `--tool`). */
const SANITIZER_TOOL_KEYS = [
  'memcheck',
  'racecheck',
  'initcheck',
] as const;

/** The sanitizer memcheck sub-options the section DAO carries (truthy subset feeds `--<key>=yes`). */
const SANITIZER_MEMCHECK_OPTION_KEYS = [
  'leak-check',
  'check-unused-memory',
] as const;

/**
 * Triton command strategy.
 * Triton runs the current configured python target directly.
 */
export class TritonCommandStrategy extends BasePythonCommandStrategy implements CommandStrategy {
  protected readonly pythonOpType = 'triton';

  buildRunCommand(context: CommandContext<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, op,
    } = context;
    const runScript = normalizePythonCommandInterpreter(config.targetFile || '');

    if (!runScript) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    return joinCommands(sourceCannCmd, cdCmd, runScript);
  }

  buildOpCommand(params: CommandBuildParams<BuildOpConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, op,
    } = params;
    const scriptField = params.scriptField || 'script';

    const scriptValue = scriptField === 'cpu_debug_script'
      ? config.cpuDebugScript
      : scriptField === 'npu_debug_script'
        ? config.npuDebugScript
        : config.script;

    const script = (scriptValue || '').trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    const cmd = new Command(script);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildExampleCommand(params: CommandBuildParams<BuildExampleConfig>): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd, op,
    } = params;
    const script = (config.script || '').trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    const cmd = new Command(script);

    if (compileOption) {
      cmd.addArgument(compileOption);
    }

    if (advance_cmd) {
      cmd.addArgument(advance_cmd);
    }

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(context: CommandContext<SanitizerConfig>, exampleTargetFile?: string): string {
    const {
      config, sourceCannCmd, cdCmd, op,
    } = context;
    const commandName = normalizeSanitizerCommand(config.toolType);
    const command = createSanitizerCommand(commandName);
    // Partial DAOs carry only the fields the user set — guard reads like
    // `|| {}`.
    const tool = config.tool ?? {};
    const memcheckOption = config.memcheckOption ?? {};

    addSanitizerToolOptions(command, tool, commandName);

    // npu-check takes none of the mssanitizer-only flags below.
    if (commandName !== 'npu-check') {
      // Emit the memcheck sub-options whenever they are enabled, independent of the memcheck
      // checkbox: per the mssanitizer docs a sub-option (e.g. --leak-check=yes) auto-enables
      // memory check, so `-t racecheck --leak-check=yes` is a valid documented invocation.
      SANITIZER_MEMCHECK_OPTION_KEYS.forEach((key) => {
        if (memcheckOption[key]) {
          command.addOption(key, 'yes');
        }
      });

      command.addOption('log-level', normalizeLogLevel(config.logLevel));
      command.addOption(
        'max-debuglog-size',
        normalizeMaxDebuglogSize(config.maxDebuglogSize),
      );

      const useBlock = config.useBlock === true;
      const blockId = normalizeBlockId(config.blockId);

      if (useBlock && blockId !== undefined) {
        command.addOption('block-id', blockId);
      }
    }

    const workspacePath =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const logFilePath = buildSanitizerLogFilePath(workspacePath, commandName);

    command.addOption('log-file', quoteShellTokenIfNeeded(logFilePath));

    const pythonProgram = normalizePythonCommandInterpreter((exampleTargetFile || config.targetFile || '').trim());

    if (!pythonProgram) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    command.addArgument('--');
    command.addArgument(pythonProgram);

    return joinCommands(sourceCannCmd, cdCmd, command.toString());
  }

  buildUtTestCommand(_params: CommandBuildParams<UtTestConfig>): string {
    throw new Error(t('triton.utTestNotSupported'));
  }

  getRunTargetFile(op: string): string {
    const script = getPythonRunTargetFile()
      .trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op }));
    }

    return script;
  }

  getProfilerTargetFile(config: ProfilerTargetConfig, operator: OpRecord | null, op: string): string {
    // Sanitizer: the active .py is synced into THIS config's target_file by
    // syncSanitizerPythonTargetFromActiveEditor and surfaced as the DAO's targetFile.
    // Read it directly — do NOT fall back to the static build_op default,
    // which would shadow the file the user actually opened.
    if ('targetFile' in config) {
      return config.targetFile || '';
    }

    // Simulate / on-board: mirror PyAsc — the profiler target comes from the workspace deploy setting.
    return ConfigService.readBuildOpDeployTargetFromWorkspace()
      || OperatorPluginRegistry.getDefaultPaths({
        op_type: 'triton',
        op_path: operator?.op_path || '',
        op_name: resolveFallbackOperatorName(operator, op),
      }).targetOpFile;
  }
}
