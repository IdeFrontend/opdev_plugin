import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { t } from 'i18next';
import {
  joinCommands,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';
import {
  CommandStrategy,
  CommandContext,
  CommandBuildParams,
} from './types';
import {
  getPythonRunTargetFile,
  normalizePythonCommandInterpreter,
  quoteShellTokenIfNeeded,
  resolvePythonExecutablePath,
} from './python-operator-strategy-shared';
import { getEnvironmentScriptPathFromWorkspace } from '@plugin/helpers/operator-project-workspace-config';
import { BasePythonCommandStrategy } from './base-python-strategy';
import { getConfig } from '@plugin/domain/services/configuration';
import {
  normalizeBlockId,
  normalizeLogLevel,
  normalizeMaxDebuglogSize,
  normalizeSanitizerTools,
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

/**
 * Triton command strategy.
 * Triton runs the current configured python target directly.
 */
export class TritonCommandStrategy extends BasePythonCommandStrategy implements CommandStrategy {
  protected readonly pythonOpType = 'triton';

  buildRunCommand(context: CommandContext): string {
    const {
      config, sourceCannCmd, cdCmd,
    } = context;
    const runScript = normalizePythonCommandInterpreter(config.target_file || '');

    if (!runScript) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    return joinCommands(sourceCannCmd, cdCmd, runScript);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd,
    } = params;
    const scriptField = params.scriptField || 'script';
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    const script = (userOptions?.[scriptField] as string | undefined)?.trim() || '';

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
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

  buildExampleCommand(params: CommandBuildParams): string {
    const {
      config, sourceCannCmd, cdCmd, compileOption, advance_cmd,
    } = params;
    const script = (config.script || '').trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
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

  buildSanitizerCommand(
    config: ConfigRecord,
    _operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
  ): string {
    const options =
      (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions =
      (options.tool as Record<string, unknown> | undefined) || {};
    const tools = normalizeSanitizerTools(Object.keys(toolOptions)
      .filter((key) => toolOptions[key]));
    const mssanitizer = new Command('mssanitizer');

    // Skip --tool when nothing is selected so no empty token leaks into the command
    // (mssanitizer defaults to memcheck when --tool is absent).
    if (tools.length > 0) {
      mssanitizer.addOption('tool', tools);
    }

    // Emit the memcheck sub-options whenever they are enabled, independent of the memcheck
    // checkbox: per the mssanitizer docs a sub-option (e.g. --leak-check=yes) auto-enables
    // memory check, so `-t racecheck --leak-check=yes` is a valid documented invocation.
    const memcheckOptions =
      (options.memcheckOption as Record<string, unknown> | undefined) || {};

    Object.keys(memcheckOptions)
      .forEach((key) => {
        if (memcheckOptions[key]) {
          mssanitizer.addOption(key, 'yes');
        }
      });

    mssanitizer.addOption('log-level', normalizeLogLevel(options.logLevel));
    mssanitizer.addOption(
      'max-debuglog-size',
      normalizeMaxDebuglogSize(options.maxDebuglogSize),
    );

    const useBlock = options.useBlock === true;
    const blockId = normalizeBlockId(options.blockId);

    if (useBlock && blockId !== undefined) {
      mssanitizer.addOption('block-id', blockId);
    }

    const workspacePath =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const logFilePath = joinIdeConfigPath(
      workspacePath,
      'mindstudio_sanitizer_log',
      `mssanitizer_${new Date()
        .valueOf()}.log`,
    );

    // Quote so a workspace path containing spaces stays a single --log-file token under `shell: true`.
    mssanitizer.addOption('log-file', quoteShellTokenIfNeeded(logFilePath));

    const pythonProgram = normalizePythonCommandInterpreter((exampleTargetFile || config.target_file || '').trim());

    if (!pythonProgram) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    mssanitizer.addArgument('--');
    mssanitizer.addArgument(pythonProgram);

    return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
  }

  buildUtTestCommand(_params: CommandBuildParams): string {
    throw new Error(t('triton.utTestNotSupported'));
  }

  getRunTargetFile(config: ConfigRecord, _operator: OpRecord | null): string {
    const script = getPythonRunTargetFile(config)
      .trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    return script;
  }

  getProfilerTargetFile(config: ConfigRecord, _operator: OpRecord | null, _exampleConfigId: number): string {
    // Sanitizer: the active .py is synced into THIS config's target_file by
    // syncSanitizerPythonTargetFromActiveEditor and surfaced as the top-level target_file by
    // getRuntimeConfigById. Read it directly — do NOT fall back to the static build_op default,
    // which would shadow the file the user actually opened.
    if (config.config_type === 'sanitizer') {
      return config.target_file || '';
    }

    // Simulate / on-board: mirror PyAsc — the profiler target comes from the build_op row.
    // FIXME: still the legacy configs.json target_file column, not the workspace deploy setting.
    const buildOpConfigs = getConfig(config.project_id, 'build_op', config.op);
    const buildOpConfig = buildOpConfigs.length > 0 ? buildOpConfigs[0] : null;

    return buildOpConfig?.target_file || '';
  }
}
