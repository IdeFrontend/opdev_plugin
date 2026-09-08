const mockJumpToFile = jest.fn();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => {
  class EventEmitter<T> {
    readonly event = jest.fn();
    readonly fire = jest.fn((_value?: T) => undefined);
    readonly dispose = jest.fn();
  }

  class TreeItem {
    id?: string;
    command?: unknown;
    contextValue?: string;
    iconPath?: unknown;
    description?: string;
    tooltip?: unknown;

    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  class MarkdownString {
    isTrusted?: boolean;

    constructor(public value: string) {}
  }

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    EventEmitter,
    MarkdownString,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [
          uri.fsPath,
          ...segments,
        ].join('/'),
      }),
    },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
    },
    env: { language: 'en' },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(),
      showErrorMessage: jest.fn(),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
    },
  };
}, { virtual: true });

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: {} }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: {} }));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: { jumpToFile: mockJumpToFile } }));
jest.mock('@plugin/controller/performance-data-controller', () => ({
  performanceMethods: {
    getRunData: jest.fn(),
    toggleRecordMark: jest.fn(),
    copyReport: jest.fn(),
    downloadReport: jest.fn(),
  },
}));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: {} }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: {} }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import { COMMAND_SIDEBAR_SANITIZER_STACK_JUMP } from '@plugin/constants';
import { OperateTreeProvider } from '@plugin/class/operate-tree-provider';

type SanitizerMessageLike = {
  title: string;
  type: 'error' | 'warning';
  questionType: string;
  question: string;
  fileLink?: string;
  row?: number;
  col?: number;
  originData: string;
  sourceTool?: 'mssanitizer' | 'npu-check';
  groupName?: string;
};

type SanitizerStateHarness = {
  state: {
    sanitizer: {
      selectedMessages: SanitizerMessageLike[];
    };
  };
};

type SanitizerTooltipHarness = {
  buildSanitizerMessageTooltip: (
    item: SanitizerMessageLike,
    problemType: string,
    handling: string,
  )=> { value: string };
};

type StackLink = {
  label: string;
  command: string;
  args: Array<Record<string, unknown>>;
};

const createProvider = (selectedMessages: SanitizerMessageLike[] = []): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'));

  (provider as unknown as SanitizerStateHarness).state = { sanitizer: { selectedMessages } };

  return provider;
};

const buildTooltip = (
  provider: OperateTreeProvider,
  item: SanitizerMessageLike,
): { value: string } => (provider as unknown as SanitizerTooltipHarness)
  .buildSanitizerMessageTooltip(item, 'problem-type', 'handling');

const extractStackLinks = (value: string): StackLink[] => {
  const links: StackLink[] = [];

  for (const m of value.matchAll(/- \[([^\]]*)\]\(command:([^?]*)\?([^)]*)\)/g)) {
    links.push({
      label: m[1] ?? '',
      command: m[2] ?? '',
      args: JSON.parse(decodeURIComponent(m[3] ?? '')) as StackLink['args'],
    });
  }

  return links;
};

const npuCheckItem: SanitizerMessageLike = {
  title: 'aie exec timeout',
  type: 'error',
  questionType: 'other',
  question: 'aie exec timeout',
  fileLink: '/mnt/x/a.asc',
  originData: [
    '=========ERROR: aie exec timeout',
    '=========check failed on device 0',
    '=========Device Frames:',
    '=========#0 /mnt/x/a.asc:84:9',
    '=========#1 func+0x3c0 in /home/u/b.cu:48',
  ].join('\n'),
  sourceTool: 'npu-check',
};

describe('OperateTreeProvider sanitizer npu-check tooltips and jumps', () => {
  beforeEach(() => {
    mockJumpToFile.mockClear();
  });

  it('renders npu-check tooltips with clickable stack links and no type/description rows', () => {
    const provider = createProvider();
    const tooltip = buildTooltip(provider, npuCheckItem);
    const links = extractStackLinks(tooltip.value);

    expect(tooltip.value)
      .toContain('web.sanitizerPanel.problem');
    expect(tooltip.value)
      .toContain('check failed on device 0');
    expect(tooltip.value)
      .toContain('web.sanitizerTree.stack');
    expect(tooltip.value)
      .not.toContain('web.sanitizerTree.type');
    expect(tooltip.value)
      .not.toContain('web.sanitizerTree.description');
    expect(tooltip.value)
      .not.toContain('Device Frame');

    expect(links)
      .toHaveLength(2);
    expect(links.map((link) => link.command))
      .toEqual([
        COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
        COMMAND_SIDEBAR_SANITIZER_STACK_JUMP,
      ]);
    expect(links[0]?.label)
      .toBe('/mnt/x/a.asc:84');
    expect(links[1]?.label)
      .toContain('/home/u/b.cu:48');
    expect(links[0]?.args)
      .toEqual([
        {
          fileLink: '/mnt/x/a.asc',
          row: 84,
          col: 9,
          errorTitle: 'aie exec timeout',
        },
      ]);
    expect(links[1]?.args)
      .toEqual([
        {
          fileLink: '/home/u/b.cu',
          row: 48,
          col: 1,
          errorTitle: 'aie exec timeout',
        },
      ]);
  });

  it('renders a link with row 1 for an npu-check frame with an invalid line number', () => {
    const provider = createProvider();
    const item: SanitizerMessageLike = {
      title: 'bad frame',
      type: 'error',
      questionType: 'other',
      question: 'bad frame',
      originData: [
        '=========ERROR: bad frame',
        '=========Device Frames:',
        '=========#0 /mnt/x/a.cu:abc',
      ].join('\n'),
      sourceTool: 'npu-check',
    };
    const tooltip = buildTooltip(provider, item);
    const links = extractStackLinks(tooltip.value);

    expect(links)
      .toHaveLength(1);
    expect(links[0]?.args)
      .toEqual([
        {
          fileLink: '/mnt/x/a.cu',
          row: 1,
          col: 1,
          errorTitle: 'bad frame',
        },
      ]);
  });

  it('keeps the type row for mssanitizer messages', () => {
    const provider = createProvider();
    const item: SanitizerMessageLike = {
      title: 'illegal read of size 224',
      type: 'error',
      questionType: 'memory',
      question: 'illegal read of size 224',
      originData: [
        '======ERROR: illegal read of size 224',
        '#3 dir/add_custom.cpp:88:5',
      ].join('\n'),
    };
    const tooltip = buildTooltip(provider, item);
    const links = extractStackLinks(tooltip.value);

    expect(tooltip.value)
      .toContain('web.sanitizerTree.type');
    expect(tooltip.value)
      .toContain('web.sanitizerTree.description');
    expect(links)
      .toHaveLength(1);
    expect(links[0]?.label)
      .toBe('dir/add_custom.cpp:88:5');
    expect(links[0]?.args)
      .toEqual([
        {
          fileLink: 'dir/add_custom.cpp',
          row: 88,
          col: 5,
          errorTitle: 'illegal read of size 224',
        },
      ]);
  });

  it('jumps to line 1 for an npu-check message without row/col', async () => {
    const provider = createProvider([
      {
        title: 'aie exec timeout',
        type: 'error',
        questionType: 'other',
        question: 'aie exec timeout',
        fileLink: '/mnt/x/a.asc',
        originData: '=========ERROR: aie exec timeout',
        sourceTool: 'npu-check',
      },
    ]);

    await provider.jumpToSanitizerMessage('0');

    expect(mockJumpToFile)
      .toHaveBeenCalledWith({
        fileLink: '/mnt/x/a.asc',
        row: 1,
        col: 1,
        errorTitle: 'aie exec timeout',
        errorMessage: expect.any(String),
      });
  });

  it('does not jump for an mssanitizer message without row', async () => {
    const provider = createProvider([
      {
        title: 'illegal read of size 224',
        type: 'error',
        questionType: 'memory',
        question: 'illegal read of size 224',
        fileLink: '/ws/dir/add_custom.cpp',
        originData: '======ERROR: illegal read of size 224',
      },
    ]);

    await provider.jumpToSanitizerMessage('0');

    expect(mockJumpToFile)
      .not
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider sanitizer npu-check class grouping', () => {
  type DerivedHarness = {
    buildSanitizerMessageDerived: (msg: SanitizerMessageLike)=> {
      classKey: string;
      classLabel: string;
    };
    getSanitizerResultGroups: (mode: string)=> Array<{
      key: string;
      label: string;
      messages: SanitizerMessageLike[];
    }>;
  };

  const asHarness = (provider: OperateTreeProvider): DerivedHarness =>
    provider as unknown as DerivedHarness;

  it('uses the parsed group name as class key/label for npu-check messages', () => {
    const provider = createProvider();
    const harness = asHarness(provider);
    const grouped = harness.buildSanitizerMessageDerived({
      title: 'Invalid GM read',
      type: 'error',
      questionType: 'other',
      question: 'Invalid GM read',
      originData: '=========ERROR:[MEMCHECK] Invalid GM read',
      sourceTool: 'npu-check',
      groupName: 'MEMCHECK',
    });

    expect(grouped.classKey)
      .toBe('MEMCHECK');
    expect(grouped.classLabel)
      .toBe('MEMCHECK');
  });

  it('falls back to the other bucket for npu-check messages without a group tag', () => {
    const provider = createProvider();
    const harness = asHarness(provider);
    const grouped = harness.buildSanitizerMessageDerived({
      title: 'aie exec timeout',
      type: 'error',
      questionType: 'other',
      question: 'aie exec timeout',
      originData: '=========ERROR: aie exec timeout',
      sourceTool: 'npu-check',
    });

    expect(grouped.classKey)
      .toBe('other');
    expect(grouped.classLabel)
      .toBe('web.sanitizerPanel.other');
  });

  it('keeps the fixed mssanitizer classes for mssanitizer messages', () => {
    const provider = createProvider();
    const harness = asHarness(provider);
    const grouped = harness.buildSanitizerMessageDerived({
      title: 'illegal read of size 224',
      type: 'error',
      questionType: 'memory',
      question: 'illegal read of size 224',
      originData: '======ERROR: illegal read of size 224',
    });

    expect(grouped.classKey)
      .toBe('memory');
    expect(grouped.classLabel)
      .toBe('web.sanitizerPanel.memory');
  });

  it('groups npu-check messages by group name with ungrouped ones in the other bucket last', () => {
    const provider = createProvider([
      {
        title: 'mem issue',
        type: 'error',
        questionType: 'other',
        question: 'mem issue',
        originData: '=========ERROR:[MEMCHECK] mem issue',
        sourceTool: 'npu-check',
        groupName: 'MEMCHECK',
      },
      {
        title: 'ungrouped issue',
        type: 'warning',
        questionType: 'other',
        question: 'ungrouped issue',
        originData: '=========ERROR: ungrouped issue',
        sourceTool: 'npu-check',
      },
      {
        title: 'race issue',
        type: 'error',
        questionType: 'other',
        question: 'race issue',
        originData: '=========ERROR:[RACECHECK] race issue',
        sourceTool: 'npu-check',
        groupName: 'RACECHECK',
      },
      {
        title: 'another mem issue',
        type: 'error',
        questionType: 'other',
        question: 'another mem issue',
        originData: '=========ERROR:[MEMCHECK] another mem issue',
        sourceTool: 'npu-check',
        groupName: 'MEMCHECK',
      },
    ]);
    const groups = asHarness(provider)
      .getSanitizerResultGroups('class');

    expect(groups.map((group) => [
      group.key,
      group.label,
      group.messages.length,
    ]))
      .toEqual([
        [
          'MEMCHECK',
          'MEMCHECK',
          2,
        ],
        [
          'RACECHECK',
          'RACECHECK',
          1,
        ],
        [
          'other',
          'web.sanitizerPanel.other',
          1,
        ],
      ]);
  });
});
