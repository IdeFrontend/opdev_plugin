import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ensureMsdebugBreakpointFileAssociations } from '@plugin/domain/utils/msdebug-ide-settings';
import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { resetGuardedPersistChainForTest } from '@plugin/helpers/ide-settings-persist';
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
});
