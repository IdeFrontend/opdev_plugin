import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getIdeConfigDir, getIdeSettingsFilePath,
} from '@plugin/helpers/ide-config-dir';
import { ConfigService } from '@plugin/service/config-service';

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

  it('keeps every key when writers overlap (issue #37: four builds pin the SOC at once)', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ 'editor.fontSize': 14 }, null, 2)}\n`,
      'utf8',
    );

    // executeOperatorCommand fires persistDetectedSocVersion per command without awaiting it,
    // and simulateProfiler issues four commands back to back, so these read-modify-write
    // cycles overlap. Unserialized, each one reads the file before the others wrote.
    await Promise.all([
      ConfigService.writeOpDevtoolsDottedSettings({ 'environment.socVersion': 'ascend950' }, tmpRoot),
      ConfigService.writeOpDevtoolsDottedSettings({ 'environment.npuArch': 'dav-3510' }, tmpRoot),
      ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot),
      ConfigService.writeOpDevtoolsDottedSettings({ 'compileAndDeploy.buildConfig.operatorNameToCompile': 'AddCustom' }, tmpRoot),
    ]);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed)
      .toEqual({
        'editor.fontSize': 14,
        'op-devtools.environment.socVersion': 'ascend950',
        'op-devtools.environment.npuArch': 'dav-3510',
        'op-devtools.sanitizer.memory': true,
        'op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile': 'AddCustom',
      });
  });

  it('a clear that overlaps a write does not resurrect the cleared keys', async () => {
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({
        'editor.fontSize': 14,
        'op-devtools.sanitizer.memory': true,
      }, null, 2)}\n`,
      'utf8',
    );

    await Promise.all([
      ConfigService.clearOpDevtoolsWorkspaceSettings(tmpRoot),
      ConfigService.writeOpDevtoolsDottedSettings({ 'environment.socVersion': 'ascend950' }, tmpRoot),
    ]);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBeUndefined();
    expect(parsed['op-devtools.environment.socVersion'])
      .toBe('ascend950');
    expect(parsed['editor.fontSize'])
      .toBe(14);
  });

  it('reads and rewrites a settings.json that starts with a BOM', async () => {
    fs.writeFileSync(
      settingsPath,
      `\uFEFF${JSON.stringify({ 'editor.fontSize': 14 }, null, 2)}\n`,
      'utf8',
    );

    const wrote = await ConfigService.writeOpDevtoolsDottedSettings(
      { 'sanitizer.memory': true },
      tmpRoot,
    );

    expect(wrote)
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['editor.fontSize'])
      .toBe(14);
  });

  it('leaves no temp file behind after a write', async () => {
    await ConfigService.writeOpDevtoolsDottedSettings({ 'sanitizer.memory': true }, tmpRoot);

    expect(fs.readdirSync(getIdeConfigDir(tmpRoot)))
      .toEqual(['settings.json']);
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
