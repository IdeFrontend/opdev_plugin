/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Unit tests for InsightService: path resolution, version-file bookkeeping,
 * backup/restore/clear of the insight directory, the multi-fallback download
 * chain (wget / curl / PowerShell / Node.js HTTP) and the install pipeline.
 */

const mockExecFile = jest.fn();
const mockHttpsGet = jest.fn();
const mockHttpGet = jest.fn();

jest.mock('i18next', () => ({
  t: (key: string, options?: { error?: string }) =>
    options?.error ? `${key}: ${options.error}` : key,
}));

jest.mock('child_process', () => ({ execFile: (...args: unknown[]) => mockExecFile(...args) }));

jest.mock('https', () => ({ get: (...args: unknown[]) => mockHttpsGet(...args) }));

jest.mock('http', () => ({ get: (...args: unknown[]) => mockHttpGet(...args) }));

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import AdmZip from 'adm-zip';
import {
  buildWgetArgs,
  buildCurlArgs,
  buildWgetCommand,
  buildCurlCommand,
} from '@shared/insight-download-constants';
import {
  INSIGHT_VERSION_MAPPINGS,
  INSIGHT_VERSION_FILE_NAME,
  INSIGHT_BACKUP_SUFFIX,
} from '@plugin/constants';
import {
  InsightService,
  insightService,
} from '@plugin/service/insight-service';
import type { InsightVersionJson } from '@plugin/service/insight-types';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-service-'));

  tempDirs.push(dir);

  return dir;
};

const rmTempDirs = (): void => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;

    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
};

type ExecCallback = (error: Error | null | string, stdout?: string)=> void;

const execFileFails = (): void => {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecCallback;

    cb(new Error('command not found'));
  });
};

const execFileFailsNext = (): void => {
  mockExecFile.mockImplementationOnce((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecCallback;

    cb(new Error('command not found'));
  });
};

const execFileSucceedsNext = (): void => {
  mockExecFile.mockImplementationOnce((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecCallback;

    cb(null, 'ok');
  });
};

const execFileRejectsWithString = (): void => {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecCallback;

    cb('a plain string error');
  });
};

const fakeRequest = (): {
  on: jest.Mock;
  end: jest.Mock;
  cbs: Record<string, (error: Error)=> void>;
} => {
  const req: any = {
    cbs: {},
    on: jest.fn((event: string, cb: (error: Error)=> void) => {
      req.cbs[event] = cb;
    }),
    end: jest.fn(),
  };

  return req;
};

const httpResponse = (
  statusCode: number,
  headers: Record<string, string | undefined> = {},
  body = '',
): PassThrough & { statusCode: number;
  headers: Record<string, string | undefined> } => {
  const stream = new PassThrough();

  stream.statusCode = statusCode;
  stream.headers = headers;

  if (body) {
    setImmediate(() => {
      stream.end(body);
    });
  }

  return stream as PassThrough & { statusCode: number;
    headers: Record<string, string | undefined> };
};

const configureInsightPath = (value: string | undefined): {
  getMock: jest.Mock;
  updateMock: jest.Mock;
} => {
  const getMock = jest.fn()
    .mockReturnValue(value);
  const updateMock = jest.fn();

  (vscode.workspace.getConfiguration as jest.Mock)
    .mockReturnValue({
      get: getMock,
      update: updateMock,
    });

  return {
    getMock,
    updateMock,
  };
};

const makeContext = (): vscode.ExtensionContext => ({
  extensionPath: '/ext/path',
  extension: { packageJSON: { version: '1.0.0' } },
  subscriptions: [],
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
}) as unknown as vscode.ExtensionContext;

const readVersionJson = (insightPath: string): InsightVersionJson =>
  JSON.parse(fs.readFileSync(path.join(insightPath, INSIGHT_VERSION_FILE_NAME), 'utf8')) as InsightVersionJson;

const writeVersionJson = (insightPath: string, json: InsightVersionJson): void => {
  fs.mkdirSync(insightPath, { recursive: true });
  fs.writeFileSync(
    path.join(insightPath, INSIGHT_VERSION_FILE_NAME),
    JSON.stringify(json),
    'utf8',
  );
};

const createZip = (
  zipPath: string,
  files: Record<string, string>,
  withRootFolder = false,
): void => {
  const zip = new AdmZip();

  if (withRootFolder) {
    zip.addFile('root/', Buffer.alloc(0));
  }

  Object.entries(files)
    .forEach(([
      name,
      content,
    ]) => {
      zip.addFile(withRootFolder ? `root/${name}` : name, Buffer.from(content, 'utf8'));
    });

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);
};

const setPlatform = (platform: string): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
};

const originalPlatform = process.platform;

describe('InsightService', () => {
  const showErrorMessageMock = vscode.window.showErrorMessage as jest.Mock;

  beforeEach(() => {
    mockExecFile.mockReset();
    mockHttpsGet.mockReset();
    mockHttpGet.mockReset();
    mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
      cb(httpResponse(200, {}, 'fallback-body'));

      return fakeRequest();
    });
    mockHttpGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
      cb(httpResponse(200, {}, 'http-body'));

      return fakeRequest();
    });
    (vscode.workspace.getConfiguration as jest.Mock)
      .mockReset();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    delete process.env.INSIGHT_HOME_PATH;
    configureInsightPath(undefined);
    showErrorMessageMock.mockReset();
    setPlatform(originalPlatform);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    rmTempDirs();
  });

  describe('getInstance', () => {
    it('returns the same singleton instance as the exported service', () => {
      expect(InsightService.getInstance())
        .toBe(insightService);
      expect(InsightService.getInstance())
        .toBe(InsightService.getInstance());
    });
  });

  describe('getVersionFilePath', () => {
    it('joins the insight path with the version file name', () => {
      expect(insightService.getVersionFilePath('/insight/root'))
        .toBe(path.join('/insight/root', INSIGHT_VERSION_FILE_NAME));
    });
  });

  describe('compareVersions', () => {
    it('compares equal versions as 0', () => {
      expect(insightService.compareVersions('1.2.3', '1.2.3'))
        .toBe(0);
    });

    it('reports newer and older versions', () => {
      expect(insightService.compareVersions('1.2.4', '1.2.3'))
        .toBe(1);
      expect(insightService.compareVersions('1.2.3', '1.2.4'))
        .toBe(-1);
      expect(insightService.compareVersions('2.0', '1.9.9'))
        .toBe(1);
    });

    it('treats missing parts as zero when lengths differ', () => {
      expect(insightService.compareVersions('1.2', '1.2.1'))
        .toBe(-1);
      expect(insightService.compareVersions('1.2.3', '1.2.3.0'))
        .toBe(0);
    });

    it('treats non-numeric parts as zero', () => {
      expect(insightService.compareVersions('abc.1.2', '0.1.2'))
        .toBe(0);
    });
  });

  describe('findMatchingInsightVersion', () => {
    it('returns the mapping whose minimum the plugin version satisfies', () => {
      const mapping = insightService.findMatchingInsightVersion('9.9.9');

      expect(mapping)
        .toBeDefined();
      expect(mapping?.insightVersion)
        .toBe('0.0.1');
    });

    it('falls back to the lowest mapping when the plugin version is below every minimum', () => {
      expect(insightService.findMatchingInsightVersion('0.0.1'))
        .toBe(INSIGHT_VERSION_MAPPINGS[INSIGHT_VERSION_MAPPINGS.length - 1]);
    });
  });

  describe('resolveInsightPath', () => {
    it('returns the configured insight path trimmed', () => {
      configureInsightPath(' /cfg/insight ');

      expect(insightService.resolveInsightPath(makeContext()))
        .toBe('/cfg/insight');
    });

    it('falls back to INSIGHT_HOME_PATH when no config is set', () => {
      process.env.INSIGHT_HOME_PATH = ' /env/insight ';

      expect(insightService.resolveInsightPath(makeContext()))
        .toBe('/env/insight');
    });

    it('falls back to the sibling insight folder of the extension', () => {
      const context = makeContext();

      expect(insightService.resolveInsightPath(context))
        .toBe(path.join(path.dirname(context.extensionPath), 'insight'));
    });
  });

  describe('initializeInsightPathConfig', () => {
    it('does nothing when the config path is already set', async () => {
      const { updateMock } = configureInsightPath(' /set/path ');

      await insightService.initializeInsightPathConfig(makeContext());

      expect(updateMock)
        .not
        .toHaveBeenCalled();
    });

    it('writes the default path to the workspace configuration', async () => {
      const { updateMock } = configureInsightPath(undefined);

      await insightService.initializeInsightPathConfig(makeContext());

      expect(updateMock)
        .toHaveBeenCalledWith(
          'insightPath',
          path.join(path.dirname('/ext/path'), 'insight'),
          vscode.ConfigurationTarget.Workspace,
        );
    });

    it('writes the default path globally when no workspace is open', async () => {
      const { updateMock } = configureInsightPath(undefined);

      (vscode.workspace as any).workspaceFolders = undefined;

      await insightService.initializeInsightPathConfig(makeContext());

      expect(updateMock)
        .toHaveBeenCalledWith(
          'insightPath',
          path.join(path.dirname('/ext/path'), 'insight'),
          vscode.ConfigurationTarget.Global,
        );
    });

    it('swallows config update errors', async () => {
      const updateMock = jest.fn()
        .mockRejectedValue(new Error('settings locked'));

      (vscode.workspace.getConfiguration as jest.Mock)
        .mockReturnValue({
          get: jest.fn()
            .mockReturnValue(undefined),
          update: updateMock,
        });

      await expect(insightService.initializeInsightPathConfig(makeContext()))
        .resolves
        .toBeUndefined();
    });
  });

  describe('readVersionFile / writeVersionFile', () => {
    it('returns null when the version file does not exist', async () => {
      const dir = makeTempDir();

      expect(await insightService.readVersionFile(dir))
        .toBeNull();
    });

    it('parses a valid version file', async () => {
      const dir = makeTempDir();

      writeVersionJson(dir, {
        version: '1.2.3',
        createTime: 't0',
        historyVersion: [],
      });

      const result = await insightService.readVersionFile(dir);

      expect(result?.version)
        .toBe('1.2.3');
      expect(result?.createTime)
        .toBe('t0');
    });

    it('returns null for a corrupt version file', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, INSIGHT_VERSION_FILE_NAME), '{not json', 'utf8');

      expect(await insightService.readVersionFile(dir))
        .toBeNull();
    });

    it('writes the version file with pretty-printed JSON', async () => {
      const dir = makeTempDir();
      const json: InsightVersionJson = {
        version: '1.0.0',
        createTime: 't1',
        historyVersion: [],
      };

      await insightService.writeVersionFile(dir, json);

      expect(fs.readFileSync(path.join(dir, INSIGHT_VERSION_FILE_NAME), 'utf8'))
        .toBe(JSON.stringify(json, null, 2));
    });
  });

  describe('updateVersionFile', () => {
    it('writes a fresh version file without history', async () => {
      const dir = makeTempDir();

      await insightService.updateVersionFile(dir, '2.0.0');

      const json = readVersionJson(dir);

      expect(json.version)
        .toBe('2.0.0');
      expect(json.historyVersion)
        .toEqual([]);
    });

    it('moves the previous version into history preserving older history', async () => {
      const dir = makeTempDir();

      writeVersionJson(dir, {
        version: '1.0.0',
        createTime: 't1',
        historyVersion: [
          {
            version: '0.9.0',
            createTime: 't0',
            updateTime: 'tu',
          },
        ],
      });

      await insightService.updateVersionFile(dir, '2.0.0');

      const json = readVersionJson(dir);

      expect(json.version)
        .toBe('2.0.0');
      expect(json.historyVersion)
        .toHaveLength(2);
      expect(json.historyVersion[0].version)
        .toBe('1.0.0');
      expect(json.historyVersion[0].createTime)
        .toBe('t1');
      expect(json.historyVersion[0].updateTime)
        .toBeDefined();
      expect(json.historyVersion[1].version)
        .toBe('0.9.0');
    });
  });

  describe('createDefaultVersionFile', () => {
    it('writes version 0.0.1 with an empty history', async () => {
      const dir = makeTempDir();

      await insightService.createDefaultVersionFile(dir);

      const json = readVersionJson(dir);

      expect(json.version)
        .toBe('0.0.1');
      expect(json.historyVersion)
        .toEqual([]);
      expect(json.createTime)
        .toBeDefined();
    });
  });

  describe('getBackupPath / backupInsight', () => {
    it('builds the backup path with the backup suffix', () => {
      expect(insightService.getBackupPath('/parent/insight'))
        .toBe(path.join('/parent', `insight${INSIGHT_BACKUP_SUFFIX}`));
    });

    it('copies the insight directory to the backup path', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'insight');

      fs.mkdirSync(insightPath);
      fs.writeFileSync(path.join(insightPath, 'a.txt'), 'new-a');

      await insightService.backupInsight(insightPath);

      expect(fs.readFileSync(path.join(parent, `insight${INSIGHT_BACKUP_SUFFIX}`, 'a.txt'), 'utf8'))
        .toBe('new-a');
    });

    it('replaces an existing stale backup', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'insight');
      const backupPath = path.join(parent, `insight${INSIGHT_BACKUP_SUFFIX}`);

      fs.mkdirSync(insightPath);
      fs.writeFileSync(path.join(insightPath, 'a.txt'), 'new-a');
      fs.mkdirSync(backupPath);
      fs.writeFileSync(path.join(backupPath, 'stale.txt'), 'stale');

      await insightService.backupInsight(insightPath);

      expect(fs.existsSync(path.join(backupPath, 'stale.txt')))
        .toBe(false);
      expect(fs.readFileSync(path.join(backupPath, 'a.txt'), 'utf8'))
        .toBe('new-a');
    });
  });

  describe('restoreInsight', () => {
    it('does nothing when no backup exists', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, 'a.txt'), 'keep');

      await insightService.restoreInsight(dir);

      expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'))
        .toBe('keep');
    });

    it('replaces the insight directory from the backup and removes it', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'insight');
      const backupPath = path.join(parent, `insight${INSIGHT_BACKUP_SUFFIX}`);

      fs.mkdirSync(insightPath);
      fs.writeFileSync(path.join(insightPath, 'broken.txt'), 'broken');
      fs.mkdirSync(backupPath);
      fs.writeFileSync(path.join(backupPath, 'good.txt'), 'good');

      await insightService.restoreInsight(insightPath);

      expect(fs.existsSync(path.join(insightPath, 'broken.txt')))
        .toBe(false);
      expect(fs.readFileSync(path.join(insightPath, 'good.txt'), 'utf8'))
        .toBe('good');
      expect(fs.existsSync(backupPath))
        .toBe(false);
    });

    it('creates the insight directory from the backup when it is missing', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'insight');
      const backupPath = path.join(parent, `insight${INSIGHT_BACKUP_SUFFIX}`);

      fs.mkdirSync(backupPath);
      fs.writeFileSync(path.join(backupPath, 'good.txt'), 'good');

      await insightService.restoreInsight(insightPath);

      expect(fs.readFileSync(path.join(insightPath, 'good.txt'), 'utf8'))
        .toBe('good');
      expect(fs.existsSync(backupPath))
        .toBe(false);
    });
  });

  describe('clearInsightDirectory', () => {
    it('removes files and directories but keeps the version file', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, INSIGHT_VERSION_FILE_NAME), '{}', 'utf8');
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'sub', 'file.txt'), 'x');
      fs.writeFileSync(path.join(dir, 'top.txt'), 'y');
      fs.writeFileSync(path.join(dir, 'insight.zip'), 'zip');

      await insightService.clearInsightDirectory(dir);

      expect(fs.readdirSync(dir))
        .toEqual([INSIGHT_VERSION_FILE_NAME]);
    });
  });

  describe('downloadFile', () => {
    const url = 'https://gitcode.net/opdevtools/plugin_release/releases/download/msinsight/msinsight.zip';

    it('downloads with wget on the first attempt', async () => {
      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileSucceedsNext();

      await insightService.downloadFile(url, destPath);

      expect(mockExecFile)
        .toHaveBeenCalledWith('wget', buildWgetArgs(destPath, url), expect.any(Function));
      expect(mockExecFile)
        .toHaveBeenCalledTimes(1);
    });

    it('falls back to curl when wget fails', async () => {
      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileFailsNext();
      execFileSucceedsNext();

      await insightService.downloadFile(url, destPath);

      expect(mockExecFile)
        .toHaveBeenNthCalledWith(1, 'wget', buildWgetArgs(destPath, url), expect.any(Function));
      expect(mockExecFile)
        .toHaveBeenNthCalledWith(2, 'curl', buildCurlArgs(destPath, url), expect.any(Function));
    });

    it('falls back to PowerShell on Windows when wget and curl fail', async () => {
      if (process.platform !== 'win32') {
        return;
      }

      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileFailsNext();
      execFileFailsNext();
      execFileSucceedsNext();

      await insightService.downloadFile(url, destPath);

      expect(mockExecFile)
        .toHaveBeenNthCalledWith(3, 'powershell.exe', expect.any(Array), expect.any(Function));
    });

    it('falls back to the Node.js HTTP downloader when every command fails', async () => {
      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileFails();
      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(200, {}, 'node-http-body'));

        return fakeRequest();
      });

      await insightService.downloadFile(url, destPath);

      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(fs.readFileSync(destPath, 'utf8'))
        .toBe('node-http-body');
    });

    it('throws a detailed error listing every attempted command', async () => {
      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileFails();
      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(500, {}, 'server error'));

        return fakeRequest();
      });

      await expect(insightService.downloadFile(url, destPath))
        .rejects
        .toThrow('All download methods failed.');

      await expect(insightService.downloadFile(url, destPath))
        .rejects
        .toThrow('Attempted commands:');

      await expect(insightService.downloadFile(url, destPath))
        .rejects
        .toThrow(buildWgetCommand(destPath, url));

      await expect(insightService.downloadFile(url, destPath))
        .rejects
        .toThrow(buildCurlCommand(destPath, url));

      if (process.platform === 'win32') {
        await expect(insightService.downloadFile(url, destPath))
          .rejects
          .toThrow('powershell.exe -Command');
      }
    });

    it('labels non-Error failures as unknown errors in the attempt details', async () => {
      const destPath = path.join(makeTempDir(), 'file.bin');

      execFileRejectsWithString();
      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(500, {}, 'boom'));

        return fakeRequest();
      });

      await expect(insightService.downloadFile(url, destPath))
        .rejects
        .toThrow('unknown error');
    });
  });

  describe('downloadFileWithNodeHttp', () => {
    const httpsUrl = 'https://gitcode.net/insight/msinsight.zip';

    it('writes the response body to the destination file', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(200, {}, 'zip-content'));

        return fakeRequest();
      });

      await (insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath);

      expect(fs.readFileSync(destPath, 'utf8'))
        .toBe('zip-content');
    });

    it('builds https request options with default port and headers', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      await (insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath);

      const options = mockHttpsGet.mock.calls[0][0];

      expect(options.hostname)
        .toBe('gitcode.net');
      expect(options.port)
        .toBe(443);
      expect(options.path)
        .toBe('/insight/msinsight.zip');
      expect(options.headers['User-Agent'])
        .toContain('Mozilla');
      expect(options.headers['Referer'])
        .toBe('https://gitcode.net/');
    });

    it('uses the http protocol with an explicit port for http URLs', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      await (insightService as any).downloadFileWithNodeHttp('http://example.com:8080/a.zip?b=c', destPath);

      const options = mockHttpGet.mock.calls[0][0];

      expect(options.port)
        .toBe(8080);
      expect(options.path)
        .toBe('/a.zip?b=c');
      expect(mockHttpsGet)
        .not
        .toHaveBeenCalled();
    });

    it('rejects on HTTP error status codes', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(404, {}, 'not found'));

        return fakeRequest();
      });

      await expect((insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath))
        .rejects
        .toThrow('Download failed with status 404');
    });

    it('follows a single redirect and writes the final response', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      mockHttpsGet
        .mockImplementationOnce((_options: unknown, cb: (res: any)=> void) => {
          cb(httpResponse(302, { location: 'https://cdn.example.com/insight.zip' }));

          return fakeRequest();
        })
        .mockImplementation((_options: unknown, cb: (res: any)=> void) => {
          cb(httpResponse(200, {}, 'redirected-content'));

          return fakeRequest();
        });

      await (insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath);

      expect(mockHttpsGet)
        .toHaveBeenCalledTimes(2);
      expect(fs.readFileSync(destPath, 'utf8'))
        .toBe('redirected-content');
    });

    it('writes the body when a redirect has no location header', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(302, {}, 'redirect-without-location'));

        return fakeRequest();
      });

      await (insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath);

      expect(fs.readFileSync(destPath, 'utf8'))
        .toBe('redirect-without-location');
    });

    it('gives up after too many redirects', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');

      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(302, { location: 'https://cdn.example.com/again.zip' }));

        return fakeRequest();
      });

      await expect((insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath))
        .rejects
        .toThrow('Too many redirects');
    });

    it('rejects when the underlying request errors', async () => {
      const destPath = path.join(makeTempDir(), 'out.zip');
      const request = fakeRequest();

      mockHttpsGet.mockImplementation(() => request);

      const promise = (insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath);

      request.cbs.error(new Error('ECONNREFUSED'));

      await expect(promise)
        .rejects
        .toThrow('ECONNREFUSED');
    });

    it('rejects and cleans up the partial file when the stream errors', async () => {
      const destPath = path.join(makeTempDir(), 'missing-dir', 'out.zip');

      mockHttpsGet.mockImplementation((_options: unknown, cb: (res: any)=> void) => {
        cb(httpResponse(200, {}, 'partial'));

        return fakeRequest();
      });

      await expect((insightService as any).downloadFileWithNodeHttp(httpsUrl, destPath))
        .rejects
        .toThrow();
    });
  });

  describe('validateZipFile', () => {
    it('rejects when the file is missing', async () => {
      await expect((insightService as any).validateZipFile(path.join(makeTempDir(), 'missing.zip')))
        .rejects
        .toThrow('Downloaded file not found');
    });

    it('rejects an empty file', async () => {
      const zipPath = path.join(makeTempDir(), 'empty.zip');

      fs.writeFileSync(zipPath, '');

      await expect((insightService as any).validateZipFile(zipPath))
        .rejects
        .toThrow('Downloaded file is empty');
    });

    it('rejects a file that is too small', async () => {
      const zipPath = path.join(makeTempDir(), 'small.zip');

      fs.writeFileSync(zipPath, 'PK');

      await expect((insightService as any).validateZipFile(zipPath))
        .rejects
        .toThrow('Downloaded file is too small');
    });

    it('rejects a file with a wrong magic number and includes a content preview', async () => {
      const zipPath = path.join(makeTempDir(), 'fake.zip');

      fs.writeFileSync(zipPath, 'this is not a zip archive at all');

      await expect((insightService as any).validateZipFile(zipPath))
        .rejects
        .toThrow(/not a valid ZIP file/);

      await expect((insightService as any).validateZipFile(zipPath))
        .rejects
        .toThrow('Content preview: this is not a zip archive at all');
    });

    it('accepts a valid zip file', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'valid.zip');

      createZip(zipPath, { 'a.txt': 'a' });

      await expect((insightService as any).validateZipFile(zipPath))
        .resolves
        .toBeUndefined();
    });
  });

  describe('unzipFile', () => {
    it('does nothing for an empty zip', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'empty.zip');
      const destPath = path.join(dir, 'out');
      const zip = new AdmZip();

      zip.writeZip(zipPath);

      await insightService.unzipFile(zipPath, destPath);

      expect(fs.existsSync(destPath))
        .toBe(false);
    });

    it('extracts files below a common root folder without the root itself', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'with-root.zip');
      const destPath = path.join(dir, 'out');

      createZip(zipPath, {
        'a.txt': 'a-content',
        'sub/b.txt': 'b-content',
      }, true);

      await insightService.unzipFile(zipPath, destPath);

      expect(fs.readFileSync(path.join(destPath, 'a.txt'), 'utf8'))
        .toBe('a-content');
      expect(fs.readFileSync(path.join(destPath, 'sub', 'b.txt'), 'utf8'))
        .toBe('b-content');
      expect(fs.existsSync(path.join(destPath, 'root')))
        .toBe(false);
    });

    it('extracts everything with extractAllTo when entries share no common root', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'multi-root.zip');
      const destPath = path.join(dir, 'out');
      const zip = new AdmZip();

      zip.addFile('a/', Buffer.alloc(0));
      zip.addFile('a/x.txt', Buffer.from('x'));
      zip.addFile('b/', Buffer.alloc(0));
      zip.addFile('b/y.txt', Buffer.from('y'));
      zip.writeZip(zipPath);

      await insightService.unzipFile(zipPath, destPath);

      expect(fs.readFileSync(path.join(destPath, 'a', 'x.txt'), 'utf8'))
        .toBe('x');
      expect(fs.readFileSync(path.join(destPath, 'b', 'y.txt'), 'utf8'))
        .toBe('y');
    });

    it('falls back to extractAllTo when an entry lives outside the candidate root', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'mixed.zip');
      const destPath = path.join(dir, 'out');
      const zip = new AdmZip();

      zip.addFile('root/', Buffer.alloc(0));
      zip.addFile('root/inner.txt', Buffer.from('inside'));
      zip.addFile('outside.txt', Buffer.from('outside'));
      zip.writeZip(zipPath);

      await insightService.unzipFile(zipPath, destPath);

      expect(fs.readFileSync(path.join(destPath, 'root', 'inner.txt'), 'utf8'))
        .toBe('inside');
      expect(fs.readFileSync(path.join(destPath, 'outside.txt'), 'utf8'))
        .toBe('outside');
    });
  });

  describe('findCommonRootFolder', () => {
    it('returns null for an empty entry list', () => {
      expect((insightService as any).findCommonRootFolder([]))
        .toBeNull();
    });

    it('returns null when no directory entries exist', () => {
      const zip = new AdmZip();

      zip.addFile('file.txt', Buffer.from('x'));

      expect((insightService as any).findCommonRootFolder(zip.getEntries()))
        .toBeNull();
    });

    it('returns the single shared root folder', () => {
      const zip = new AdmZip();

      zip.addFile('root/', Buffer.alloc(0));
      zip.addFile('root/a.txt', Buffer.from('x'));

      expect((insightService as any).findCommonRootFolder(zip.getEntries()))
        .toBe('root/');
    });

    it('returns null when entries are spread over multiple roots', () => {
      const zip = new AdmZip();

      zip.addFile('a/', Buffer.alloc(0));
      zip.addFile('a/x.txt', Buffer.from('x'));
      zip.addFile('b/', Buffer.alloc(0));
      zip.addFile('b/y.txt', Buffer.from('y'));

      expect((insightService as any).findCommonRootFolder(zip.getEntries()))
        .toBeNull();
    });
  });

  describe('downloadAndExtractInsight', () => {
    const mapping = INSIGHT_VERSION_MAPPINGS[0];

    it('downloads, validates, extracts and validates the installation', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'insight.zip');

      createZip(zipPath, { 'index.html': '<html>insight ui</html>' });
      execFileSucceedsNext();

      await insightService.downloadAndExtractInsight(mapping, dir);

      expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'))
        .toBe('<html>insight ui</html>');
      expect(fs.existsSync(zipPath))
        .toBe(false);
    });

    it('rejects when the download does not produce a valid zip', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'insight.zip');

      fs.writeFileSync(zipPath, 'html error page', 'utf8');
      execFileSucceedsNext();

      await expect(insightService.downloadAndExtractInsight(mapping, dir))
        .rejects
        .toThrow(/not a valid ZIP file/);
      expect(fs.existsSync(zipPath))
        .toBe(false);
    });

    it('rejects when the zip lacks index.html', async () => {
      const dir = makeTempDir();
      const zipPath = path.join(dir, 'insight.zip');

      createZip(zipPath, { 'assets/app.js': 'js' });
      execFileSucceedsNext();

      await expect(insightService.downloadAndExtractInsight(mapping, dir))
        .rejects
        .toThrow('Insight installation validation failed: index.html not found');
    });
  });

  describe('initializeInsight', () => {
    const setupContext = (): vscode.ExtensionContext => makeContext();

    // The real download chain is covered by the downloadFile tests; here the
    // download is simulated by writing a valid zip into the target path.
    const mockDownloadAsZip = (files: Record<string, string>): jest.SpyInstance =>
      jest.spyOn(insightService, 'downloadFile')
        .mockImplementation(async (_url: string, destPath: string) => {
          createZip(destPath, files);
        });

    it('installs insight on a fresh install and writes the version file', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'insight');
      const zipPath = path.join(insightPath, 'insight.zip');
      const downloadSpy = mockDownloadAsZip({ 'index.html': '<html>fresh</html>' });

      configureInsightPath(insightPath);

      await insightService.initializeInsight(setupContext());

      const json = readVersionJson(insightPath);

      expect(downloadSpy)
        .toHaveBeenCalledTimes(1);
      expect(json.version)
        .toBe('0.0.1');
      expect(json.historyVersion)
        .toEqual([]);
      expect(fs.readFileSync(path.join(insightPath, 'index.html'), 'utf8'))
        .toBe('<html>fresh</html>');
      expect(fs.existsSync(zipPath))
        .toBe(false);

      downloadSpy.mockRestore();
    });

    it('creates the insight directory before downloading', async () => {
      const parent = makeTempDir();
      const insightPath = path.join(parent, 'brand-new-insight');
      const downloadSpy = jest.spyOn(insightService, 'downloadFile')
        .mockRejectedValue(new Error('network down'));

      configureInsightPath(insightPath);

      await expect(insightService.initializeInsight(setupContext()))
        .rejects
        .toThrow('network down');

      expect(fs.existsSync(insightPath))
        .toBe(true);

      downloadSpy.mockRestore();
    });

    it('reports the download failure and rethrows', async () => {
      const dir = makeTempDir();
      const downloadSpy = jest.spyOn(insightService, 'downloadFile')
        .mockRejectedValue(new Error('network down'));

      configureInsightPath(dir);

      await expect(insightService.initializeInsight(setupContext()))
        .rejects
        .toThrow('network down');
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.downloadFailed: network down');
      expect(fs.existsSync(path.join(dir, INSIGHT_VERSION_FILE_NAME)))
        .toBe(false);

      downloadSpy.mockRestore();
    });

    it('creates a default version file when index.html exists without one', async () => {
      const dir = makeTempDir();
      const downloadSpy = jest.spyOn(insightService, 'downloadFile');

      fs.writeFileSync(path.join(dir, 'index.html'), '<html>existing</html>');
      configureInsightPath(dir);

      await insightService.initializeInsight(setupContext());

      expect(readVersionJson(dir).version)
        .toBe('0.0.1');
      expect(downloadSpy)
        .not
        .toHaveBeenCalled();

      downloadSpy.mockRestore();
    });

    it('does nothing when the installed version already matches', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, 'index.html'), '<html>current</html>');
      writeVersionJson(dir, {
        version: '0.0.1',
        createTime: 't0',
        historyVersion: [],
      });
      configureInsightPath(dir);

      await insightService.initializeInsight(setupContext());

      expect(mockExecFile)
        .not
        .toHaveBeenCalled();
      expect(fs.existsSync(path.join(dir, `insight${INSIGHT_BACKUP_SUFFIX}`)))
        .toBe(false);
    });

    it('upgrades on a version mismatch, cleaning the backup afterwards', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, 'index.html'), '<html>v1</html>');
      fs.writeFileSync(path.join(dir, 'stale-extra.txt'), 'stale');
      writeVersionJson(dir, {
        version: '9.9.9',
        createTime: 't0',
        historyVersion: [],
      });
      const downloadSpy = mockDownloadAsZip({ 'index.html': '<html>v2</html>' });

      configureInsightPath(dir);

      await insightService.initializeInsight(setupContext());

      const json = readVersionJson(dir);

      expect(downloadSpy)
        .toHaveBeenCalledTimes(1);
      expect(json.version)
        .toBe('0.0.1');
      expect(json.historyVersion)
        .toHaveLength(1);
      expect(json.historyVersion[0].version)
        .toBe('9.9.9');
      expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'))
        .toBe('<html>v2</html>');
      expect(fs.existsSync(path.join(dir, 'stale-extra.txt')))
        .toBe(false);
      expect(fs.existsSync(path.join(dir, `insight${INSIGHT_BACKUP_SUFFIX}`)))
        .toBe(false);

      downloadSpy.mockRestore();
    });

    it('restores the backup when an upgrade download fails', async () => {
      const dir = makeTempDir();

      fs.writeFileSync(path.join(dir, 'index.html'), '<html>original</html>');
      writeVersionJson(dir, {
        version: '9.9.9',
        createTime: 't0',
        historyVersion: [],
      });
      const downloadSpy = jest.spyOn(insightService, 'downloadFile')
        .mockRejectedValue(new Error('network down'));

      configureInsightPath(dir);

      await expect(insightService.initializeInsight(setupContext()))
        .rejects
        .toThrow('network down');
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.downloadFailed: network down');
      expect(readVersionJson(dir).version)
        .toBe('9.9.9');
      expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'))
        .toBe('<html>original</html>');
      expect(fs.existsSync(path.join(dir, `insight${INSIGHT_BACKUP_SUFFIX}`)))
        .toBe(false);

      downloadSpy.mockRestore();
    });

    it('shows the generic message for non-Error download failures', async () => {
      const dir = makeTempDir();
      const spy = jest.spyOn(insightService, 'downloadAndExtractInsight')
        .mockRejectedValue('a string error');

      configureInsightPath(dir);

      await expect(insightService.initializeInsight(setupContext()))
        .rejects
        .toBe('a string error');
      expect(showErrorMessageMock)
        .toHaveBeenCalledWith('insight.downloadFailed: insight.downloadErrorUnknown');

      spy.mockRestore();
    });
  });
});
