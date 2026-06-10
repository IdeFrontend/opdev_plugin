jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/domain/utils/op-util', () => ({ getOpRunPath: jest.fn() }));

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  resolveAscendEnv: jest.fn(),
}));

jest.mock('@plugin/domain/services/profiler-service', () => ({
  ProfilerFactory: { getStrategy: jest.fn() },
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
  },
}));

jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: jest.fn(() => ({ get: jest.fn() })),
  },
}), { virtual: true });

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
}));

import {
  buildPythonDeployTarget,
  normalizePythonCommandInterpreter,
  quoteShellTokenIfNeeded,
} from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';

describe('python-operator-strategy-shared shell quoting', () => {
  describe('quoteShellTokenIfNeeded', () => {
    it('quotes paths with spaces', () => {
      expect(quoteShellTokenIfNeeded('operator copy.py')).toBe("'operator copy.py'");
    });

    it('leaves plain paths unquoted', () => {
      expect(quoteShellTokenIfNeeded('./foo.py')).toBe('./foo.py');
    });
  });

  describe('buildPythonDeployTarget', () => {
    it('quotes relative paths with spaces', () => {
      expect(buildPythonDeployTarget('operator copy.py'))
        .toBe("python3 'operator copy.py'");
    });
  });

  describe('normalizePythonCommandInterpreter', () => {
    it('quotes script path with spaces', () => {
      expect(normalizePythonCommandInterpreter('python3 operator copy.py'))
        .toBe("python3 'operator copy.py'");
    });

    it('leaves plain script paths unquoted', () => {
      expect(normalizePythonCommandInterpreter('python3 ./foo.py'))
        .toBe('python3 ./foo.py');
    });
  });
});
