import { t } from 'i18next';
import { getOpRunPath } from '@plugin/domain/utils/op-util';
import { joinCommands } from '@plugin/domain/utils/command-utils';
import { ConfigRecord } from '@plugin/domain/models/config-model';
import { OpRecord } from '@plugin/domain/models/model';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProfilerFactory } from '../profiler-service';
import { resolveAscendEnv } from '@plugin/domain/utils/ascend-util';
import {
  BaseContext, CommandContext,
} from './types';

/**
 * Shared by PyAsc and Triton: Ascend env sourcing, operator run path, identical cd for build/run.
 */
export function buildPythonOperatorCommandContext(baseContext: BaseContext): CommandContext {
  const {
    config, project, operator,
  } = baseContext;

  const sourceCannCmd =
    project && project.ascend_env_script
      ? `. ${project.ascend_env_script}`
      : '';

  let runPath: string;

  if (operator) {
    runPath = getOpRunPath(operator);
  }
  else if (config.script && project) {
    runPath = project.project_path;
  }
  else {
    throw new Error(`Operator not found: ${config.op}`);
  }

  const cdCmd = `cd ${runPath}`;

  return {
    config,
    project,
    operator,
    sourceCannCmd,
    cdCmd,
    cdBuildCmd: cdCmd,
  };
}

type ProfilerMissingProjectKey =
  | 'cann.cannotGenerateSimulateCommand'
  | 'cann.cannotGenerateOnBoardCommand';

/**
 * Profiler strategies need an operator row; synthesize one from the project when only config+workspace exist.
 */
export function resolveProfilerOperatorOrThrow(
  config: ConfigRecord,
  project: BaseContext['project'],
  operator: OpRecord | null,
  opType: string,
  missingProjectI18nKey: ProfilerMissingProjectKey,
): OpRecord {
  if (operator) {
    return operator;
  }

  if (!project?.project_path) {
    throw new Error(t(missingProjectI18nKey, { op: config.op }));
  }

  return {
    id: 0,
    project_id: config.project_id,
    op_name: config.op,
    op_type: opType,
    op_path: project.project_path,
  } as OpRecord;
}

function quoteShellTokenIfNeeded(arg: string): string {
  if (/[\s"'`$]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  return arg;
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

  return `${resolved}${match[3]}${match[4]}`;
}

export function buildPythonSimulateCommand(
  config: ConfigRecord,
  project: BaseContext['project'],
  operator: OpRecord | null,
  sourceCannCmd: string,
  cdCmd: string,
  exampleTargetFile: string,
  opType: string,
): string {
  const effectiveOperator = resolveProfilerOperatorOrThrow(
    config,
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

  return joinCommands(sourceCannCmd, cdCmd, simulatorCmd);
}

export function buildPythonOnBoardCommand(
  config: ConfigRecord,
  project: BaseContext['project'],
  operator: OpRecord | null,
  sourceCannCmd: string,
  cdCmd: string,
  exampleTargetFile: string,
  opType: string,
): string {
  const effectiveOperator = resolveProfilerOperatorOrThrow(
    config,
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

  return joinCommands(sourceCannCmd, cdCmd, onBoardCmd);
}

export function getPythonRunTargetFile(config: ConfigRecord): string {
  return config.target_file || '';
}
