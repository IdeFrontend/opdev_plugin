const mockShowErrorMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockShowQuickPick = jest.fn();
const mockT = jest.fn((key: string, options?: Record<string, unknown>) => {
  if (key.startsWith('stTest.mode.')) {
    return `mode:${key.slice('stTest.mode.'.length)}`;
  }

  switch (key) {
    case 'stTest.pickModes':
      return 'Pick modes';
    case 'stTest.noAvailableModes':
      return 'No available modes';
    case 'stTest.discoveryFailed':
      return `discovery:${String(options?.error)}`;
    default:
      return key;
  }
});

jest.mock('i18next', () => ({ t: mockT }));

jest.mock('vscode', () => ({
  window: {
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: mockShowInformationMessage,
    showQuickPick: mockShowQuickPick,
  },
}), { virtual: true });

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveStTestInputDir } from '@plugin/domain/utils/st-test-paths';
import { pickAvailableStTestModes } from '@plugin/helpers/st-test-mode-picker';
import enMessages from '@shared/i18n/en';
import zhCnMessages from '@shared/i18n/zh-cn';

const CSV_BY_MODE = {
  kernel: 'testcase_name,op_name\ncase,add\n',
  aclnn: 'testcase_name,api_name\ncase,aclnnAdd\n',
  e2e: 'testcase_name,api_name\ncase,torch.add\n',
} as const;

describe('filtered ST test mode picker', () => {
  let root: string;
  let operatorPath: string;
  let inputDirectory: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowErrorMessage.mockResolvedValue(undefined);
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockShowQuickPick.mockResolvedValue(undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-mode-picker-'));
    operatorPath = path.join(root, 'operator');
    inputDirectory = resolveStTestInputDir(operatorPath);
    fs.mkdirSync(inputDirectory, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function writeInput(
    name: string,
    mode: keyof typeof CSV_BY_MODE,
  ): void {
    fs.writeFileSync(path.join(inputDirectory, name), CSV_BY_MODE[mode]);
  }

  it('shows only available modes in canonical order and prefers kernel', async () => {
    writeInput('ttk_aclnn_misleading.csv', 'e2e');
    writeInput('kernel-suite.csv', 'kernel');
    fs.mkdirSync(path.join(inputDirectory, 'aclnn-directory.csv'));
    mockShowQuickPick.mockImplementation(async (items) => [
      items[1],
      items[0],
    ]);

    const selected = await pickAvailableStTestModes(root, operatorPath);

    expect(mockShowQuickPick)
      .toHaveBeenCalledWith([
        {
          label: 'mode:kernel',
          description: 'kernel',
          picked: true,
          mode: 'kernel',
        },
        {
          label: 'mode:e2e',
          description: 'e2e',
          picked: false,
          mode: 'e2e',
        },
      ], {
        canPickMany: true,
        placeHolder: 'Pick modes',
      });
    expect(selected)
      .toEqual([
        'kernel',
        'e2e',
      ]);
  });

  it('preselects the first available canonical mode when kernel is unavailable', async () => {
    writeInput('api-suite.csv', 'aclnn');
    mockShowQuickPick.mockImplementation(async (items) => [items[0]]);

    const selected = await pickAvailableStTestModes(root, operatorPath);

    expect(mockShowQuickPick.mock.calls[0][0])
      .toEqual([
        {
          label: 'mode:aclnn',
          description: 'aclnn',
          picked: true,
          mode: 'aclnn',
        },
      ]);
    expect(selected)
      .toEqual(['aclnn']);
  });

  it('shows localized no-input feedback without opening an empty picker', async () => {
    writeInput('kernel-suite.txt', 'kernel');

    const selected = await pickAvailableStTestModes(root, operatorPath);

    expect(selected)
      .toBeUndefined();
    expect(mockShowInformationMessage)
      .toHaveBeenCalledWith('No available modes');
    expect(mockShowQuickPick).not.toHaveBeenCalled();
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });

  it('reports discovery errors and stops before opening the picker', async () => {
    fs.rmSync(inputDirectory, { recursive: true });
    fs.writeFileSync(inputDirectory, 'not a directory');

    const selected = await pickAvailableStTestModes(root, operatorPath);

    expect(selected)
      .toBeUndefined();
    expect(mockShowErrorMessage)
      .toHaveBeenCalledTimes(1);
    expect(mockShowErrorMessage.mock.calls[0][0])
      .toMatch(/^discovery:/);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it.each([
    [
      'dismisses the picker',
      undefined,
    ],
    [
      'confirms an empty selection',
      [],
    ],
  ])('returns no modes when the user %s', async (_scenario, pickerResult) => {
    writeInput('kernel-suite.csv', 'kernel');
    mockShowQuickPick.mockResolvedValue(pickerResult);

    await expect(pickAvailableStTestModes(root, operatorPath))
      .resolves.toBeUndefined();
  });

  it('rejects an operator outside the workspace before reading its inputs', async () => {
    const workspaceRoot = path.join(root, 'workspace');

    fs.mkdirSync(workspaceRoot);

    await expect(pickAvailableStTestModes(workspaceRoot, operatorPath))
      .resolves.toBeUndefined();

    expect(mockShowErrorMessage)
      .toHaveBeenCalledTimes(1);
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });

  it('defines matching English and Chinese discovery messages', () => {
    const keys = [
      'stTest.noAvailableModes',
      'stTest.discoveryFailed',
    ] as const;

    keys.forEach((key) => {
      expect(enMessages[key])
        .toBeTruthy();
      expect(zhCnMessages[key])
        .toBeTruthy();
    });
    expect(enMessages['stTest.discoveryFailed'])
      .toContain('{{error}}');
    expect(zhCnMessages['stTest.discoveryFailed'])
      .toContain('{{error}}');
  });
});
