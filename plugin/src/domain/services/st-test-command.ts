import { joinCommands } from '@plugin/domain/utils/command-utils';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';

export const ST_TEST_MODES = [
  'kernel',
  'aclnn',
  'e2e',
] as const;

export type StTestMode = typeof ST_TEST_MODES[number];

export function normalizeStTestModes(values: readonly string[]): StTestMode[] {
  const normalized = values.map((value) => value.trim()
    .toLowerCase());
  const unknown = [...new Set(normalized.filter((value) => !ST_TEST_MODES.includes(value as StTestMode)))];

  if (unknown.length > 0) {
    throw new Error(`Unsupported ST test mode(s): ${unknown.join(', ')}`);
  }

  const requested = new Set(normalized);

  return ST_TEST_MODES.filter((mode) => requested.has(mode));
}

export function buildPythonPathExport(entries: readonly string[]): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const value = entries.join(':');

  return `export PYTHONDONTWRITEBYTECODE=1 && export PYTHONPATH=${shellQuoteBash(value)}\${PYTHONPATH:+:$PYTHONPATH}`;
}

export function buildSourcedPythonCommand(params: {
  interpreter: string;
  environmentScriptPath?: string;
  pythonPathEntries?: readonly string[];
  args: readonly string[];
}): string {
  const source = params.environmentScriptPath
    ? `. ${shellQuoteBash(params.environmentScriptPath)}`
    : undefined;
  const pythonPath = buildPythonPathExport(params.pythonPathEntries ?? []);
  const invocation = [
    shellQuoteBash(params.interpreter),
    ...params.args.map((arg) => shellQuoteBash(arg)),
  ].join(' ');

  return joinCommands(source, pythonPath, invocation);
}

export function buildStTestCommand(params: {
  interpreter: string;
  environmentScriptPath?: string;
  pythonPathEntries?: readonly string[];
  mode: StTestMode;
  inputCsvPath: string;
  outputCsvPath: string;
  pluginPath: string;
}): string {
  const modeArgs = params.mode === 'kernel'
    ? [
      '-d=false',
      '-b=release',
      '--pc=8',
    ]
    : [];

  return buildSourcedPythonCommand({
    interpreter: params.interpreter,
    environmentScriptPath: params.environmentScriptPath,
    pythonPathEntries: params.pythonPathEntries,
    args: [
      '-m',
      'ttk',
      params.mode,
      '-i',
      params.inputCsvPath,
      '-o',
      params.outputCsvPath,
      '--plugin',
      params.pluginPath,
      ...modeArgs,
    ],
  });
}
