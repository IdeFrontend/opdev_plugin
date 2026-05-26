import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ConfigService } from '@plugin/service/config-service';

describe('ConfigService settings file', () => {
  let tmpRoot: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-settings-'));
    const vscodeDir = path.join(tmpRoot, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    settingsPath = path.join(vscodeDir, 'settings.json');
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
        'op-devtools': {
          sanitizer: { memory: true },
        },
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
        'op-devtools': {
          sanitizer: { memory: true },
        },
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
    await ConfigService.writeOpDevtoolsDottedSettings({
      'sanitizer.memory': true,
    }, tmpRoot);

    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(parsed['op-devtools.sanitizer.memory'])
      .toBe(true);
    expect(parsed['op-devtools.environment.socVersion'])
      .toBeUndefined();
    expect(parsed['op-devtools.performanceTuning.simulation.simulatorType'])
      .toBeUndefined();
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
      .not.toMatch(
        /assignIfDefined\(updates, 'performanceTuning\.simulation\.simulatorType'/,
      );
    expect(source)
      .not.toMatch(/opDevtoolsWriteDepth|isOpDevtoolsSettingsWriteInProgress|runSerializedSettingsFileOp/);
  });
});
