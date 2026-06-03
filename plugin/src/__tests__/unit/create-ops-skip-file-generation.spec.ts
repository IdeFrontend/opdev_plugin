jest.mock('i18next', () => ({ t: (key: string) => key }));

const checkVscode = jest.fn();

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: () => ({
      projectId: 10,
      getProjectName: () => 'add',
      getProjectInfo: () => ({ name: 'add' }),
      checkVscode,
    }),
  },
}));

jest.mock('@plugin/domain', () => ({
  updateShScript: jest.fn(),
  generateOpsPrototype: jest.fn(),
  generateStructure: jest.fn()
    .mockResolvedValue(1),
  getProjectById: jest.fn(),
}));

import { generateStructure } from '@plugin/domain';
import { projectService } from '@plugin/service/project-service';

describe('createOpsByPrototype: skipFileGeneration threading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { extensionContext: { extensionPath: string } }).extensionContext = { extensionPath: '/ext' };
  });

  const baseParams = {
    opsPrototypeFile: '/repo/math/add/add.json',
    opType: 'ascend' as const,
    opName: 'add',
    projectId: 10,
    opPath: '/repo/math/add',
  };

  it('passes isSkipUnZip=true to generateStructure when skipFileGeneration is true', async () => {
    await projectService.createOpsByPrototype({
      ...baseParams,
      skipFileGeneration: true,
    });

    expect(generateStructure)
      .toHaveBeenCalledTimes(1);
    expect((generateStructure as jest.Mock).mock.calls[0][2])
      .toBe(true);
  });

  it('passes isSkipUnZip=false when skipFileGeneration is absent (fallback parity)', async () => {
    await projectService.createOpsByPrototype({ ...baseParams });

    expect(generateStructure)
      .toHaveBeenCalledTimes(1);
    expect((generateStructure as jest.Mock).mock.calls[0][2])
      .toBe(false);
  });
});
