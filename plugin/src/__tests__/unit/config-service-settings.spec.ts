import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import {
  buildLegacySettingsMigrationWritesFromRows, ConfigService,
} from '@plugin/service/config-service';

describe('ConfigService settings file', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-settings-'));
    fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
    settingsPath = getIdeSettingsFilePath(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('writeOpDevtoolsDottedSettings flattens nested op-devtools when updates are empty', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'editor.fontSize': 14,
        'op-devtools': { sanitizer: { memory: true } },
      }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({}, tmpRoot);

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools'])
      .toBeUndefined();
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['editor.fontSize'])
      .toBe(14);
  });

  it('prefers existing dotted keys over nested values when migrating', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'op-devtools': { sanitizer: { memory: true } },
        'op-devtools.sanitizer.memory': false,
      }, null, 2)}\n`,
      'utf8',
    );

    await ConfigService.writeOpDevtoolsDottedSettings({}, tmpRoot);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(false);
  });

  it('writeOpDevtoolsDottedSettings is a no-op when already dotted-only and updates are empty', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.sanitizer.memory': true }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({}, tmpRoot);

    expect(wrote)
      .toBe(false);
  });

  it('writeOpDevtoolsDottedSettings persists dotted op-devtools keys', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['op-devtools.environment.socVersion'])
      .toBeUndefined();
    expect(parsed['op-devtools.performanceTuning.simulation.simulatorType'])
      .toBeUndefined();
  });

  it('reads a settings file with a BOM and preserves foreign keys on write', async () => {
    fs.writeFileSync(
      settingsPath,
      `\uFEFF${JSON.stringify({ 'editor.fontSize': 14 }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
  });

  it('atomic write leaves no temp file behind', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(fs.readdirSync(getIdeConfigDir(tmpRoot)))
      .toEqual(['settings.json']);
  });

  it('migrates the stored build_op operator into operatorNameToCompile', () => {
    const writes = buildLegacySettingsMigrationWritesFromRows(
      [
        {
          id: 1,
          config_type: 'build_op',
          user_options: {
            op: 'saved_op',
            script: 'bash build.sh',
          },
          project_id: 1,
        },
      ],
      [],
      '/etc/profile',
    );

    expect(writes['compileAndDeploy.buildConfig.operatorNameToCompile'])
      .toBe('saved_op');
  });

  it('clearOpDevtoolsWorkspaceSettings removes dotted and nested op-devtools keys', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'editor.fontSize': 14,
        'op-devtools.sanitizer.memory': true,
        'op-devtools': { debugMode: true },
      }, null, 2)}\n`,
      'utf8',
    );

    const cleared = await ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot);

    expect(cleared)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['editor.fontSize'])
      .toBe(14);
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBeUndefined();
    expect(parsed['op-devtools'])
      .toBeUndefined();
  });

  it('clearOpDevtoolsWorkspaceSettings deletes settings file when only op-devtools keys remain', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'op-devtools.debugMode': true }, null, 2)}\n`,
      'utf8',
    );

    const cleared = await ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot);

    expect(cleared)
      .toBe(true);
    expect(fs.existsSync(settingsPath))
      .toBe(false);
  });

  it('clearOpDevtoolsWorkspaceSettings is a no-op when no op-devtools keys exist', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'editor.fontSize': 14 }, null, 2)}\n`,
      'utf8',
    );

    const cleared = await ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot);

    expect(cleared)
      .toBe(false);
  });

  it('does not seed or push socVersion / simulatorType from DB', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../service/config-service.ts'),
      'utf8',
    );

    expect(source)
      .not.toMatch(/queue\('environment\.socVersion'/);
    expect(source)
      .not.toMatch(/queue\('performanceTuning\.simulation\.simulatorType'/);
    expect(source)
      .not.toMatch(/assignIfDefined\(updates, 'performanceTuning\.simulation\.simulatorType'/);
    expect(source)
      .not.toMatch(/opDevtoolsWriteDepth|isOpDevtoolsSettingsWriteInProgress|runSerializedSettingsFileOp|settingsWriteChainsByRoot/);
  });
});
