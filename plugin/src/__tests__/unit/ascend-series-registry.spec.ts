import {
  _resetDetectedChipCacheForTest,
  detectSocSlugFromProbe,
  extractChipNames,
  getNpuArchForChipName,
  matchChipNameToSeries,
  normalizeChipNameForMatching,
} from '@shared/ascend-series-registry';
import { NPU_ARCH_DAV_1001, NPU_ARCH_DAV_2201, NPU_ARCH_DAV_3510 } from '@shared/cann-env-constants';

describe('ascend-series-registry', () => {
  beforeEach(() => {
    _resetDetectedChipCacheForTest();
  });

  describe('normalizeChipNameForMatching', () => {
    it('removes internal spaces', () => {
      expect(normalizeChipNameForMatching('Ascend 910_9362 V1'))
        .toBe('Ascend910_9362V1');
    });
  });

  describe('matchChipNameToSeries', () => {
    it.each([
      ['Ascend910B3', 'a2'],
      ['Ascend 910B3', 'a2'],
      ['Ascend910_9362', 'a3'],
      ['Ascend 910_9362 V1', 'a3'],
      ['Ascend950PR_9589', 'a5'],
    ])('maps %s to series %s', (chip, series) => {
      expect(matchChipNameToSeries(chip))
        .toBe(series);
    });

    it.each([
      'Ascend910ProA',
      'Ascend 910 ProA',
      'Ascend910PremiumA',
      'Ascend901A',
    ])('maps exact chip %s to A2', (chip) => {
      expect(matchChipNameToSeries(chip))
        .toBe('a2');
    });

    it('prefers A2 prefix over A3 for 910B', () => {
      expect(matchChipNameToSeries('Ascend910B3'))
        .toBe('a2');
    });
  });

  describe('getNpuArchForChipName', () => {
    it('uses dav-1001 for Pro/Premium/901', () => {
      expect(getNpuArchForChipName('Ascend910ProA'))
        .toBe(NPU_ARCH_DAV_1001);
      expect(getNpuArchForChipName('Ascend 910 ProA'))
        .toBe(NPU_ARCH_DAV_1001);
    });

    it('uses dav-2201 for typical A2 prefix chips', () => {
      expect(getNpuArchForChipName('Ascend910B3'))
        .toBe(NPU_ARCH_DAV_2201);
    });

    it('uses dav-3510 for A5', () => {
      expect(getNpuArchForChipName('Ascend950PR_9589'))
        .toBe(NPU_ARCH_DAV_3510);
    });
  });

  describe('extractChipNames', () => {
    it('parses Chip Name lines', () => {
      const probe = [
        'NPU   Name',
        'Chip Name : Ascend 910_9362 V1',
        'Chip Name:Ascend910B3',
      ].join('\n');

      expect(extractChipNames(probe))
        .toEqual([
          'Ascend 910_9362 V1',
          'Ascend910B3',
        ]);
    });

    it('falls back to Ascend tokens when no label', () => {
      expect(extractChipNames('device Ascend910B3 ok'))
        .toEqual(['Ascend910B3']);
    });
  });

  describe('detectSocSlugFromProbe', () => {
    it('detects A3 from spaced Chip Name line', () => {
      const hit = detectSocSlugFromProbe('Chip Name : Ascend 910_9362 V1\n');

      expect(hit)
        .toEqual({
          socVersion: 'ascend910_93',
          series: 'a3',
          chipRaw: 'Ascend 910_9362 V1',
        });
    });

    it('caches raw chip on detection', () => {
      detectSocSlugFromProbe('Chip Name : Ascend910ProA\n');

      expect(getNpuArchForChipName('Ascend910ProA'))
        .toBe(NPU_ARCH_DAV_1001);
    });
  });
});
