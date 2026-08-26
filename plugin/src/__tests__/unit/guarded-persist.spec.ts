import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import {
  guardedPersistIdeSettingsFile,
  readIdeSettingsJson,
  resetGuardedPersistChainForTest,
  tryParseSettingsJsonc,
} from '@plugin/helpers/ide-settings-persist';
import {
  ConfigService, readSettingsJsonFile,
} from '@plugin/service/config-service';

describe('guarded persist (shared settings.json writers)', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    resetGuardedPersistChainForTest();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guarded-persist-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('the settings READER tolerates JSONC like the writer (comments + trailing commas)', async () => {
    fs.writeFileSync(settingsPath, [
      '{',
      '  // user note',
      '  "op-devtools.internal.settingsVersion": "1.4.6",',
      '  "op-devtools.projectType": "cann",',
      '}',
      '',
    ].join('\n'), 'utf8');

    const parsed = readSettingsJsonFile(settingsPath);

    expect(parsed['op-devtools.internal.settingsVersion'])
      .toBe('1.4.6');
    expect(parsed['op-devtools.projectType'])
      .toBe('cann');
  });

  it('serializes concurrent writers — no lost update', async () => {
    for (let round = 0; round < 5; round++) {
      await Promise.all([
        ConfigService.writeOpDevtoolsDottedSettings({ [`sanitizer.memory.${round}`]: true }, tmpRoot),
        ensureMsdebugBreakpointFileAssociations(tmpRoot),
      ]);
    }

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    for (let round = 0; round < 5; round++) {
      expect(parsed[`op-devtools.sanitizer.memory.${round}`])
        .toBe(true);
    }

    expect((parsed['files.associations'] as Record<string, string>)['*.cce'])
      .toBe('cpp');
    expect((parsed['files.associations'] as Record<string, string>)['*.asc'])
      .toBe('cpp');
  });

  it('skips a byte-identical write (content-diff guard)', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);
    const before = fs.readFileSync(settingsPath, 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf8'))
      .toBe(before);
  });

  it('msdebug writer does not clobber op-devtools keys', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({
      'sanitizer.memory': true,
      'compileAndDeploy.buildConfig.compileCommand': 'bash build.sh',
    }, tmpRoot);

    await ensureMsdebugBreakpointFileAssociations(tmpRoot);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe('bash build.sh');
    expect((parsed['files.associations'] as Record<string, string>)['*.cce'])
      .toBe('cpp');
  });

  it('reads a JSONC settings file (comments + trailing commas) and preserves foreign keys', async () => {
    // Hand-edited settings files legally contain // comments and trailing
    // commas; the read must tolerate them instead of treating the file as
    // corrupt (and refusing the write) or as empty (and rebuilding it).
    fs.writeFileSync(settingsPath, [
      '{',
      '  // user note',
      '  "editor.fontSize": 14,',
      '  "editor.rulers": [80, 100,],',
      '}',
      '',
    ].join('\n'), 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['editor.rulers'])
      .toEqual([
        80,
        100,
      ]);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
  });

  it('round-trips string values with backslash/quote runs and comment-like text', async () => {
    // String escapes must follow JSON rules exactly: a quote preceded by an
    // odd number of backslashes is literal and does not end the value, and
    // `//` / block-comment markers inside a value must not be treated as
    // comments. Each logical value below is embedded via JSON.stringify, so
    // the file on disk carries its exact escape form.
    const trickyValues = [
      'C:\\Program Files\\Node\\node.exe',
      'a\\"quoted\\"b',
      'http://host/x/*y*/z',
      'text // not a comment',
      'odd backslashes \\\\\\ at the end',
    ];

    fs.writeFileSync(settingsPath, [
      '{',
      '  // user note',
      ...trickyValues.map((value, index) => `  "foreign.tricky${index}": ${JSON.stringify(value)},`),
      '  "editor.fontSize": 14,',
      '}',
      '',
    ].join('\n'), 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    trickyValues.forEach((value, index) => {
      expect(parsed[`foreign.tricky${index}`])
        .toBe(value);
    });

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
  });

  it('reads a settings file with a block comment and preserves foreign keys', async () => {
    fs.writeFileSync(settingsPath, [
      '{',
      '  /* user note */',
      '  "editor.fontSize": 14,',
      '}',
      '',
    ].join('\n'), 'utf8');

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
  });

  it('writeOpDevtoolsDottedSettings does not clobber files.associations', async () => {
    await ensureMsdebugBreakpointFileAssociations(tmpRoot);

    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect((parsed['files.associations'] as Record<string, string>)['*.cce'])
      .toBe('cpp');
    expect((parsed['files.associations'] as Record<string, string>)['*.asc'])
      .toBe('cpp');
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
  });

  it('clearOp goes through the same lock — final state is consistent', async () => {
    await Promise.all([
      ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot),
      ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot),
    ]);

    if (fs.existsSync(settingsPath)) {
      // Both outcomes are consistent: write-after-clear (keys present) or
      // clear-after-write (file absent or no op-devtools keys). Interleaved
      // garbage would fail JSON parse or resurrect keys after the delete.
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const hasOpDevtools = Object.keys(parsed)
        .some((key) => key.startsWith('op-devtools'));

      expect(hasOpDevtools ? parsed['op-devtools.sanitizer.memory'] === true : true)
        .toBe(true);
    }
  });

  describe('low-level persist API', () => {
    it('readIdeSettingsJson treats a missing, empty or whitespace file as {}', () => {
      expect(readIdeSettingsJson(settingsPath))
        .toEqual({});

      fs.writeFileSync(settingsPath, '', 'utf8');
      expect(readIdeSettingsJson(settingsPath))
        .toEqual({});

      fs.writeFileSync(settingsPath, ' \n\t ', 'utf8');
      expect(readIdeSettingsJson(settingsPath))
        .toEqual({});
    });

    it('readIdeSettingsJson treats unparseable content as {}', () => {
      fs.writeFileSync(settingsPath, '{ not json', 'utf8');

      expect(readIdeSettingsJson(settingsPath))
        .toEqual({});
    });

    it('tryParseSettingsJsonc tolerates a BOM and rejects non-object payloads', () => {
      expect(tryParseSettingsJsonc('﻿{ "a": 1 }'))
        .toEqual({ a: 1 });
      expect(tryParseSettingsJsonc('{ "a": 1, }'))
        .toEqual({ a: 1 });
      expect(tryParseSettingsJsonc('// note\n{ "a": 1 }'))
        .toEqual({ a: 1 });
      expect(tryParseSettingsJsonc('{ "a": }'))
        .toBeUndefined();
      expect(tryParseSettingsJsonc('[1, 2]'))
        .toBeUndefined();
      expect(tryParseSettingsJsonc('null'))
        .toBeUndefined();
      expect(tryParseSettingsJsonc('"a string"'))
        .toBeUndefined();
      expect(tryParseSettingsJsonc('42'))
        .toBeUndefined();
    });

    it('guardedPersistIdeSettingsFile skips when the builder returns null', async () => {
      const wrote = await guardedPersistIdeSettingsFile(settingsPath, () => null);

      expect(wrote)
        .toBe(false);
      expect(fs.existsSync(settingsPath))
        .toBe(false);
    });

    it('guardedPersistIdeSettingsFile can delete the file', async () => {
      fs.writeFileSync(settingsPath, '{ "a": 1 }', 'utf8');

      const wrote = await guardedPersistIdeSettingsFile(settingsPath, () => ({ deleteFile: true }));

      expect(wrote)
        .toBe(true);
      expect(fs.existsSync(settingsPath))
        .toBe(false);
    });

    it('guardedPersistIdeSettingsFile refuses to overwrite an unparseable settings.json', async () => {
      fs.writeFileSync(settingsPath, '{ not json', 'utf8');
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => {});

      const wrote = await guardedPersistIdeSettingsFile(settingsPath, (current) => ({
        next: {
          ...current,
          'op-devtools.sanitizer.memory': true,
        },
      }));

      expect(wrote)
        .toBe(false);
      expect(fs.readFileSync(settingsPath, 'utf8'))
        .toBe('{ not json');
      expect(warnSpy)
        .toHaveBeenCalledWith('[guardedPersistIdeSettingsFile] refusing to overwrite unparseable settings.json:', settingsPath);
      warnSpy.mockRestore();
    });

    it('guardedPersistIdeSettingsFile cleans up the temp file and reports false on write failure', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => {});
      const writeFileSpy = jest.spyOn(fs.promises, 'writeFile')
        .mockRejectedValueOnce(new Error('disk full'));

      const wrote = await guardedPersistIdeSettingsFile(settingsPath, (current) => ({
        next: {
          ...current,
          'op-devtools.sanitizer.memory': true,
        },
      }));

      writeFileSpy.mockRestore();
      warnSpy.mockRestore();

      expect(wrote)
        .toBe(false);
      expect(fs.existsSync(settingsPath))
        .toBe(false);
      expect(fs.existsSync(`${settingsPath}.${process.pid}.tmp`))
        .toBe(false);
    });
  });
});
