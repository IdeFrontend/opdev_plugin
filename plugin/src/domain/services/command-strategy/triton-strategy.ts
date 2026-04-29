import { spawnSync } from 'child_process';
import { t } from 'i18next';
import {
  joinCommands,
  Command,
} from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import {
  CommandStrategy,
  CommandContext,
  CommandBuildParams,
} from './types';
import {
  getPythonRunTargetFile,
  normalizePythonCommandInterpreter,
  resolvePythonExecutablePath,
} from './python-operator-strategy-shared';
import { BasePythonCommandStrategy } from './base-python-strategy';

/**
 * Verifies the resolved interpreter can import PyTorch and Triton (typical Triton operator workspace).
 */
export function probeTritonPythonDependencies(): {
  ok: boolean;
  interpreter: string;
  stderr: string;
} {
  const interpreter = resolvePythonExecutablePath();
  const result = spawnSync(
    interpreter,
    ['-c', 'import torch; import triton'],
    { encoding: 'utf-8', timeout: 25_000, maxBuffer: 512 * 1024 },
  );
  const stderr = `${result.stderr || ''}${result.stdout || ''}`.trim();
  if (result.status === 0) {
    return { ok: true, interpreter, stderr: '' };
  }
  const errMsg = result.error?.message ?? '';
  const combined = [stderr, errMsg].filter(Boolean).join('\n');
  return { ok: false, interpreter, stderr: combined };
}

/**
 * Triton command strategy.
 * Triton runs the current configured python target directly.
 */
export class TritonCommandStrategy extends BasePythonCommandStrategy implements CommandStrategy {
  protected readonly pythonOpType = 'triton';

  buildRunCommand(context: CommandContext): string {
    const { config, sourceCannCmd, cdCmd } = context;
    const runScript = normalizePythonCommandInterpreter(config.target_file || '');
    if (!runScript) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }
    return joinCommands(sourceCannCmd, cdCmd, runScript);
  }

  buildOpCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd } = params;
    const scriptField = params.scriptField || 'script';
    const userOptions = config.user_options as Record<string, unknown> | null | undefined;
    const script = (userOptions?.[scriptField] as string | undefined)?.trim() || '';

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    const cmd = new Command(script);
    if (compileOption) cmd.addArgument(compileOption);
    if (advance_cmd) cmd.addArgument(advance_cmd);

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildExampleCommand(params: CommandBuildParams): string {
    const { config, sourceCannCmd, cdCmd, compileOption, advance_cmd } = params;
    const script = (config.script || '').trim();

    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }

    const cmd = new Command(script);
    if (compileOption) cmd.addArgument(compileOption);
    if (advance_cmd) cmd.addArgument(advance_cmd);

    return joinCommands(sourceCannCmd, cdCmd, cmd.toString());
  }

  buildSanitizerCommand(
    config: ConfigRecord,
    operator: OpRecord | null,
    sourceCannCmd: string,
    cdCmd: string,
    exampleTargetFile?: string,
  ): string {
    const mssanitizer = new Command('mssanitizer');
    if (exampleTargetFile) {
      mssanitizer.addArgument(exampleTargetFile);
    }

    const options =
      (config.user_options as Record<string, unknown> | null | undefined) || {};
    const toolOptions =
      (options.tool as Record<string, unknown> | undefined) || {};
    const tools = Object.keys(toolOptions).filter((key) => toolOptions[key]);
    mssanitizer.addOption('tool', tools);

    if (toolOptions.memcheck) {
      const memcheckOptions =
        (options.memcheckOption as Record<string, unknown> | undefined) || {};
      Object.keys(memcheckOptions).forEach((key) => {
        if (memcheckOptions[key]) {
          mssanitizer.addOption(key, 'yes');
        }
      });
    }

    mssanitizer.addOption('log-level', options.logLevel as string | undefined);
    mssanitizer.addOption(
      'max-debuglog-size',
      options.maxDebuglogSize as string | undefined,
    );
    mssanitizer.addOption(
      'block-id',
      options.blockId as string | number | undefined,
    );

    const logRoot = operator?.op_path || '.';
    mssanitizer.addOption(
      'log-file',
      `${logRoot}/.vscode/mindstudio_sanitizer_log/mssanitizer_${new Date().valueOf()}.log`,
    );

    return joinCommands(sourceCannCmd, cdCmd, mssanitizer.toString());
  }

  buildUtTestCommand(_params: CommandBuildParams): string {
    throw new Error(t('triton.utTestNotSupported'));
  }

  getRunTargetFile(config: ConfigRecord, _operator: OpRecord | null): string {
    const script = getPythonRunTargetFile(config).trim();
    if (!script) {
      throw new Error(t('cann.configMissingScript', { op: config.op }));
    }
    return script;
  }

  getProfilerTargetFile(config: ConfigRecord, _operator: OpRecord | null, _exampleConfigId: number): string {
    return config.target_file || '';
  }
}
