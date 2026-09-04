/**
 * Unit tests for the A5 new-tool selectors on ConfigService:
 * getOnBoardTool / getSimulationTool and the shouldUseNewOnBoardTool /
 * shouldUseNewSimulationTool gates that decide whether the on-board / simulation
 * entry opens the new "数据采集配置" dialog. The new tools are A5-only (ascend950):
 * an explicit workspace setting pins the tool, otherwise A5 defaults to the new
 * tool and every other SOC resolves to the legacy msprof.
 */

import { ConfigService } from '@plugin/service/config-service';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => '') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

const resolveSocMock = resolveEffectiveCannSoc as jest.Mock;

describe('ConfigService new-tool selectors', () => {
  let readSettingSpy: jest.SpyInstance;

  beforeEach(() => {
    resolveSocMock.mockReturnValue('');
    // Default: no explicit tool setting configured (undefined).
    readSettingSpy = jest.spyOn(ConfigService, 'readOpDevtoolsSetting')
      .mockReturnValue(undefined);
  });

  afterEach(() => {
    readSettingSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('getOnBoardTool', () => {
    it('defaults to npu-compute on A5 (ascend950) with no explicit setting', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });

    it('defaults to msprof on non-A5 SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.getOnBoardTool())
        .toBe('msprof');
    });

    it('honors an explicit msprof setting even on A5', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.getOnBoardTool())
        .toBe('msprof');
    });

    it('honors an explicit npu-compute setting regardless of SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');
      readSettingSpy.mockReturnValue('npu-compute');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });

    it('ignores an unrecognized setting value and falls back to SOC default', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('garbage');

      expect(ConfigService.getOnBoardTool())
        .toBe('npu-compute');
    });
  });

  describe('getSimulationTool', () => {
    it('defaults to npusim on A5 with no explicit setting', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.getSimulationTool())
        .toBe('npusim');
    });

    it('defaults to msprof on non-A5 SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.getSimulationTool())
        .toBe('msprof');
    });

    it('honors an explicit setting', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.getSimulationTool())
        .toBe('msprof');
    });
  });

  describe('shouldUseNewOnBoardTool', () => {
    it('is true only on A5 with the new tool selected', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewOnBoardTool())
        .toBe(true);
    });

    it('is false on non-A5 SOC even without an explicit legacy setting', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.shouldUseNewOnBoardTool())
        .toBe(false);
    });

    it('is false on A5 when the user pins the legacy msprof', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.shouldUseNewOnBoardTool())
        .toBe(false);
    });
  });

  describe('shouldUseNewSimulationTool', () => {
    it('is true only on A5 with the new tool selected', () => {
      resolveSocMock.mockReturnValue('ascend950');

      expect(ConfigService.shouldUseNewSimulationTool())
        .toBe(true);
    });

    it('is false on non-A5 SOC', () => {
      resolveSocMock.mockReturnValue('ascend910b');

      expect(ConfigService.shouldUseNewSimulationTool())
        .toBe(false);
    });

    it('is false on A5 when the user pins the legacy msprof', () => {
      resolveSocMock.mockReturnValue('ascend950');
      readSettingSpy.mockReturnValue('msprof');

      expect(ConfigService.shouldUseNewSimulationTool())
        .toBe(false);
    });
  });
});
