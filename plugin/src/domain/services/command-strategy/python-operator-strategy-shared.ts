import { t } from 'i18next';
import { joinCommands } from '@plugin/domain/utils/command-utils';
import type {
  SimulateConfig, OnBoardConfig,
} from '@plugin/service/config-service';
import { OpRecord } from '@plugin/domain/models/op-record';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProfilerFactory } from '../profiler-service';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import {
  BaseContext, CommandContext, ProfilerCommandParams, SectionConfig,
} from './types';
import { ConfigService } from '@plugin/service/config-service';

/**
 * Shared by PyAsc and Triton: Ascend env sourcing, operator run path, identical cd for build/run.
 */
export function buildPythonOperatorCommandContext<TConfig extends SectionConfig>(baseContext: BaseContext<TConfig>): CommandContext<TConfig> {
  const {
    config, project, operator, op,
  } = baseContext;

  const sourceCannCmd =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : '';

  let runPath: string;

  if (operator) {
    runPath = operator.op_path;
  }
  else if (config.script && project) {
    runPath = project.project_path;
  }
  else {
    throw new Error(`Operator not found: ${op}`);
  }

  const cdCmd = `cd ${runPath}`;

  return {
    config,
    project,
    operator,
    sourceCannCmd,
    cdCmd,
    cdBuildCmd: cdCmd,
    op,
  };
}

type ProfilerMissingProjectKey =
  | 'cann.cannotGenerateSimulateCommand'
  | 'cann.cannotGenerateOnBoardCommand';

/**
 * Profiler strategies need an operator row; synthesize one from the project when only config+workspace exist.
 */
export function resolveProfilerOperatorOrThrow(
  op: string,
  project: BaseContext['project'],
  operator: OpRecord | null,
  opType: string,
  missingProjectI18nKey: ProfilerMissingProjectKey,
): OpRecord {
  if (operator) {
    return operator;
  }

  if (!project?.project_path) {
    throw new Error(t(missingProjectI18nKey, { op }));
  }

  return {
    op_name: op,
    op_type: opType,
    op_path: project.project_path,
  } as OpRecord;
}

export function quoteShellTokenIfNeeded(arg: string): string {
  if (/[\s"'`$]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  return arg;
}

/** Shell-safe `python3 <relativePath>` deploy/run target for workspace settings. */
export function buildPythonDeployTarget(relativePath: string): string {
  return `python3 ${quoteShellTokenIfNeeded(relativePath)}`;
}

function findLocalVenvPython(workspaceRoot: string): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
        path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe'),
        path.join(workspaceRoot, 'venv', 'Scripts', 'python.exe'),
      ]
      : [
        path.join(workspaceRoot, '.venv', 'bin', 'python'),
        path.join(workspaceRoot, 'venv', 'bin', 'python'),
        path.join(workspaceRoot, '.venv', 'bin', 'python3'),
        path.join(workspaceRoot, 'venv', 'bin', 'python3'),
      ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Resolve python interpreter for python-based operator strategies.
 */
export function resolvePythonExecutablePath(): string {
  try {
    const folder = vscode.workspace.workspaceFolders?.[0];

    if (!folder) {
      return 'python3';
    }

    const root = folder.uri.fsPath;
    const cfg = vscode.workspace.getConfiguration('python', folder.uri);
    const interpreterPath = cfg.get<string>('defaultInterpreterPath')
      ?.trim();

    if (interpreterPath && fs.existsSync(interpreterPath)) {
      return interpreterPath;
    }

    const venvPy = findLocalVenvPython(root);

    if (venvPy) {
      return venvPy;
    }
  }
  catch {
    // ignore
  }

  return 'python3';
}

/**
 * If command starts with python/python3, rewrite it to workspace-resolved interpreter.
 */
export function normalizePythonCommandInterpreter(command: string): string {
  const script = (command || '').trim();

  if (!script) {
    return script;
  }

  const match = /^((python|python3|python\.exe))(\s+)([\s\S]+)$/i.exec(script);

  if (!match) {
    return script;
  }

  const resolved = quoteShellTokenIfNeeded(resolvePythonExecutablePath());
  const scriptPath = match[4].trim();

  return `${resolved}${match[3]}${quoteShellTokenIfNeeded(scriptPath)}`;
}

export function buildPythonSimulateCommand(
  params: ProfilerCommandParams<SimulateConfig>,
  opType: string,
): string {
  const {
    config, project, operator, cdBuildCmd, exampleTargetFile, op,
  } = params;

  const effectiveOperator = resolveProfilerOperatorOrThrow(
    op,
    project,
    operator,
    opType,
    'cann.cannotGenerateSimulateCommand',
  );
  const simulatorCmd = ProfilerFactory.getStrategy('simulator')
    .generate(
      config,
      effectiveOperator,
      exampleTargetFile,
    );

  return joinCommands(params.sourceCannCmd, cdBuildCmd, simulatorCmd);
}

export function buildPythonOnBoardCommand(
  params: ProfilerCommandParams<OnBoardConfig>,
  opType: string,
): string {
  const {
    config, project, operator, cdBuildCmd, exampleTargetFile, op,
  } = params;

  const effectiveOperator = resolveProfilerOperatorOrThrow(
    op,
    project,
    operator,
    opType,
    'cann.cannotGenerateOnBoardCommand',
  );
  const onboardCannSoc = resolveAscendEnv({ isSimulator: false }).socVersion;
  const onBoardCmd = ProfilerFactory.getStrategy('onboard')
    .generate(
      config,
      effectiveOperator,
      exampleTargetFile,
      { onboardCannSoc },
    );

  return joinCommands(params.sourceCannCmd, cdBuildCmd, onBoardCmd);
}

export function getPythonRunTargetFile(): string {
  return ConfigService.readBuildOpDeployTargetFromWorkspace() || '';
}

export { TRITON_SANITIZER_SPAWN_ENV } from '@plugin/domain/constants/triton-sanitizer-env';
