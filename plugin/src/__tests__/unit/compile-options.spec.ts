jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getSelectedOperatorIds: jest.fn(),
    checkMultipleOperators: jest.fn(),
  },
}));

import { homeMethods } from '@plugin/controller/home-controller';
import { getCompileOptionForSelectedOperators } from '@plugin/helpers/compile-options';

describe('getCompileOptionForSelectedOperators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns --experimental when a selected operator is experimental', async () => {
    (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([1]);
    (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
      isStandardCustom: true,
      operators: [
        { id: 1, isExperimental: true },
        { id: 2, isExperimental: false },
      ],
    });

    await expect(getCompileOptionForSelectedOperators()).resolves.toBe('--experimental');
  });

  it('returns undefined when no experimental selected operators', async () => {
    (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([2]);
    (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
      isStandardCustom: true,
      operators: [
        { id: 1, isExperimental: true },
        { id: 2, isExperimental: false },
      ],
    });

    await expect(getCompileOptionForSelectedOperators()).resolves.toBeUndefined();
  });

  it('returns undefined when not standard-custom context', async () => {
    (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([1]);
    (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
      isStandardCustom: false,
      operators: [{ id: 1, isExperimental: true }],
    });

    await expect(getCompileOptionForSelectedOperators()).resolves.toBeUndefined();
  });
});
