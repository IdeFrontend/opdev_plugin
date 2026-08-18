import { exec } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as vscode from 'vscode';

import {
  applyCannCppPathsToWorkspace,
  buildCannCppPaths,
  CPP_BROWSE_PATH_SETTING,
  CPP_INCLUDE_PATH_SETTING,
  isGeneratedCannCppPathValue,
  maybeApplyCannCppIncludePaths,
  resolveAscendHomePathFromEnvScript,
} from '@plugin/domain/utils/cann-cpp-include-paths';
import { resolveCannSetEnvScriptWithoutScan } from '@plugin/domain/utils/ascend-detection-env';

jest.mock('child_process', () => ({ exec: jest.fn() }));

jest.mock('@plugin/domain/utils/ascend-detection-env', () => ({
  resolveCannSetEnvScriptWithoutScan: jest.fn(() => ({
    path: '/opt/ascend/set_env.sh',
    source: 'find',
  })),
  shellSourcePrefix: (scriptPath: string) => `source '${scriptPath}' && `,
}));

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ASCEND_HOME = '/usr/local/Ascend/ascend-toolkit/latest';

const logDebug = jest.fn();

type Inspected = {
  globalValue?: string[];
  workspaceValue?: string[];
  workspaceFolderValue?: string[];
};

function stubConfiguration(inspected: Record<string, Inspected | undefined>): jest.Mock {
  const update = jest.fn();

  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    inspect: (key: string) => inspected[key],
    get: jest.fn(),
    update,
  });

  return update;
}

beforeEach(() => {
  jest.clearAllMocks();
  (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
});

describe('buildCannCppPaths', () => {
  it('mirrors the packaged configurationDefaults with ASCEND_HOME_PATH resolved', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      contributes: {
        configurationDefaults: Record<string, string[]>;
      };
    };
    const defaults = manifest.contributes.configurationDefaults;
    const resolve = (entries: string[]): string[] => entries
      .map((entry) => entry.replace('${env:ASCEND_HOME_PATH}', ASCEND_HOME));
    const paths = buildCannCppPaths(ASCEND_HOME);

    expect(paths.includePath)
      .toEqual(resolve(defaults[CPP_INCLUDE_PATH_SETTING]));
    expect(paths.browsePath)
      .toEqual(resolve(defaults[CPP_BROWSE_PATH_SETTING]));
  });

  it('drops a trailing separator from ASCEND_HOME_PATH', () => {
    expect(buildCannCppPaths(`${ASCEND_HOME}/`).includePath[1])
      .toBe(`${ASCEND_HOME}/include`);
  });
});

describe('isGeneratedCannCppPathValue', () => {
  it('recognizes its own output for any CANN install', () => {
    expect(isGeneratedCannCppPathValue(buildCannCppPaths('/opt/ascend/latest').includePath, 'includePath'))
      .toBe(true);
    expect(isGeneratedCannCppPathValue(buildCannCppPaths('/opt/ascend/latest').browsePath, 'browsePath'))
      .toBe(true);
  });

  it('rejects hand-written values', () => {
    expect(isGeneratedCannCppPathValue([
      '${workspaceFolder}/**',
      '/opt/custom/include',
    ], 'includePath'))
      .toBe(false);
    expect(isGeneratedCannCppPathValue(undefined, 'includePath'))
      .toBe(false);
  });
});

describe('applyCannCppPathsToWorkspace', () => {
  it('writes both settings when nothing is configured', async () => {
    const update = stubConfiguration({});

    await applyCannCppPathsToWorkspace(ASCEND_HOME, logDebug);

    expect(update)
      .toHaveBeenCalledWith(
        CPP_INCLUDE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).includePath,
        vscode.ConfigurationTarget.Workspace,
      );
    expect(update)
      .toHaveBeenCalledWith(
        CPP_BROWSE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).browsePath,
        vscode.ConfigurationTarget.Workspace,
      );
  });

  it('refreshes its own earlier value when the CANN install moved', async () => {
    const update = stubConfiguration({ [CPP_INCLUDE_PATH_SETTING]: { workspaceValue: buildCannCppPaths('/opt/ascend/old').includePath } });

    await applyCannCppPathsToWorkspace(ASCEND_HOME, logDebug);

    expect(update)
      .toHaveBeenCalledWith(
        CPP_INCLUDE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).includePath,
        vscode.ConfigurationTarget.Workspace,
      );
  });

  it('leaves user-owned values alone', async () => {
    const update = stubConfiguration({
      [CPP_INCLUDE_PATH_SETTING]: {
        workspaceValue: [
          '${workspaceFolder}/**',
          '/opt/custom/include',
        ],
      },
      [CPP_BROWSE_PATH_SETTING]: { globalValue: ['/opt/custom'] },
    });

    await applyCannCppPathsToWorkspace(ASCEND_HOME, logDebug);

    expect(update)
      .not
      .toHaveBeenCalled();
  });

  it('does not rewrite an identical value', async () => {
    const update = stubConfiguration({
      [CPP_INCLUDE_PATH_SETTING]: { workspaceValue: buildCannCppPaths(ASCEND_HOME).includePath },
      [CPP_BROWSE_PATH_SETTING]: { workspaceValue: buildCannCppPaths(ASCEND_HOME).browsePath },
    });

    await applyCannCppPathsToWorkspace(ASCEND_HOME, logDebug);

    expect(update)
      .not
      .toHaveBeenCalled();
  });
});

function stubExecStdout(stdout: string): void {
  (exec as unknown as jest.Mock).mockImplementation((
    _cmd: string,
    _opts: unknown,
    callback: (error: unknown, result: { stdout: string;
      stderr: string })=> void,
  ) => callback(null, {
    stdout,
    stderr: '',
  }));
}

describe('resolveAscendHomePathFromEnvScript', () => {
  it('ignores banner output a chatty set_env.sh writes to stdout', async () => {
    stubExecStdout(`Ascend environment loaded\n\n__OP_DEVTOOLS_ASCEND_HOME__${ASCEND_HOME}\n`);

    await expect(resolveAscendHomePathFromEnvScript())
      .resolves
      .toBe(ASCEND_HOME);
  });

  it('returns undefined when the script defines no ASCEND_HOME_PATH', async () => {
    stubExecStdout('Ascend environment loaded\n\n__OP_DEVTOOLS_ASCEND_HOME__\n');

    await expect(resolveAscendHomePathFromEnvScript())
      .resolves
      .toBeUndefined();
  });

  it('returns undefined without shelling out when no set_env.sh was found', async () => {
    (resolveCannSetEnvScriptWithoutScan as jest.Mock).mockReturnValueOnce(undefined);

    await expect(resolveAscendHomePathFromEnvScript())
      .resolves
      .toBeUndefined();

    expect(exec)
      .not
      .toHaveBeenCalled();
  });
});

describe('maybeApplyCannCppIncludePaths', () => {
  const originalAscendHome = process.env.ASCEND_HOME_PATH;

  afterEach(() => {
    if (originalAscendHome === undefined) {
      delete process.env.ASCEND_HOME_PATH;
    }
    else {
      process.env.ASCEND_HOME_PATH = originalAscendHome;
    }
  });

  it('skips when the manifest defaults can expand on their own', async () => {
    process.env.ASCEND_HOME_PATH = ASCEND_HOME;

    const update = stubConfiguration({});

    await maybeApplyCannCppIncludePaths(logDebug);

    expect(update)
      .not
      .toHaveBeenCalled();
  });

  it('refreshes a stale generated value even when the variable is visible', async () => {
    process.env.ASCEND_HOME_PATH = ASCEND_HOME;

    const update = stubConfiguration({ [CPP_INCLUDE_PATH_SETTING]: { workspaceValue: buildCannCppPaths('/opt/ascend/old').includePath } });

    await maybeApplyCannCppIncludePaths(logDebug);

    expect(update)
      .toHaveBeenCalledWith(
        CPP_INCLUDE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).includePath,
        vscode.ConfigurationTarget.Workspace,
      );
    expect(update)
      .toHaveBeenCalledTimes(1);
  });

  it('writes both paths from set_env.sh when ASCEND_HOME_PATH is not visible', async () => {
    // The reason GC-48 exists: an IDE started without set_env.sh sourced leaves the packaged
    // ${env:ASCEND_HOME_PATH} defaults unexpanded, so CANN headers have no go-to-definition.
    delete process.env.ASCEND_HOME_PATH;
    stubExecStdout(`__OP_DEVTOOLS_ASCEND_HOME__${ASCEND_HOME}\n`);

    const update = stubConfiguration({});

    await maybeApplyCannCppIncludePaths(logDebug);

    expect(update)
      .toHaveBeenCalledWith(
        CPP_INCLUDE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).includePath,
        vscode.ConfigurationTarget.Workspace,
      );
    expect(update)
      .toHaveBeenCalledWith(
        CPP_BROWSE_PATH_SETTING,
        buildCannCppPaths(ASCEND_HOME).browsePath,
        vscode.ConfigurationTarget.Workspace,
      );
  });

  it('writes nothing when no CANN environment script can be found', async () => {
    delete process.env.ASCEND_HOME_PATH;
    (resolveCannSetEnvScriptWithoutScan as jest.Mock).mockReturnValueOnce(undefined);

    const update = stubConfiguration({});

    await maybeApplyCannCppIncludePaths(logDebug);

    expect(update)
      .not
      .toHaveBeenCalled();
  });

  it('skips without a workspace', async () => {
    delete process.env.ASCEND_HOME_PATH;
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

    const update = stubConfiguration({});

    await maybeApplyCannCppIncludePaths(logDebug);

    expect(update)
      .not
      .toHaveBeenCalled();
  });
});
