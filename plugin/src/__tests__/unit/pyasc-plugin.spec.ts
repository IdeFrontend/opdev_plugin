jest.mock(
  'vscode',
  () => ({
    workspace: {
      workspaceFolders: [],
      getConfiguration: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('@plugin/domain/services/command-strategy/pyasc-strategy', () => ({
  PyAscCommandStrategy: class PyAscCommandStrategy {},
}));

import { PyAscPlugin } from '@plugin/domain/plugins/pyasc.plugin';
import type { OpRecord } from '@plugin/domain/models/model';

describe('PyAscPlugin', () => {
  const plugin = new PyAscPlugin();

  const op = {
    id: 1,
    project_id: 10,
    op_name: 'pyasc_temple',
    op_type: 'pyasc',
    op_path: '/tmp/pyasc_project',
  } as OpRecord;

  it('getInitialConfigScripts uses python3 entry without build.sh', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/tmp/pyasc_project');

    expect(scripts.buildScript).toBe('python3 ./pyasc_temple.py');
    expect(scripts.simulateScript).toBe('python3 ./pyasc_temple.py');
    expect(scripts.onBoardScript).toBe('python3 ./pyasc_temple.py');
    expect(Object.values(scripts).every((s) => !s.includes('build.sh'))).toBe(true);
  });

  it('getDefaultPaths points script paths at the operator .py file', () => {
    const paths = plugin.getDefaultPaths(op);

    expect(paths.opScriptPath).toContain('pyasc_temple.py');
    expect(paths.targetOpFile).toBe('python3 ./pyasc_temple.py');
  });
});
