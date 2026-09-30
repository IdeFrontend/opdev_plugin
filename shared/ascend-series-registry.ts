/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Chip Name → Ascend series → env defaults.
 * Contract: docs/ascend-env-spec.md (§1, §3–6)
 */

import {
  CANN_SOC_ASCEND_310P,
  CANN_SOC_ASCEND_910,
  CANN_SOC_ASCEND_910B,
  CANN_SOC_ASCEND_910_93,
  CANN_SOC_ASCEND_950,
  NPU_ARCH_DAV_1001,
  NPU_ARCH_DAV_2201,
  NPU_ARCH_DAV_3510,
  SIMULATOR_ASCEND_310P,
  SIMULATOR_ASCEND_910,
  SIMULATOR_ASCEND_910B3,
  SIMULATOR_ASCEND_910C,
  SIMULATOR_ASCEND_950PR_9589,
} from './cann-env-constants';

export type AscendSeries = 'a2' | 'a3' | 'a5';

export type AscendSeriesProfile = {
  socVersion: string;
  simulatorType: string;
  npuArch: string;
};

export type ExactChipRule = {
  chipName: string;
  series: AscendSeries;
  npuArch: string;
};

export type ChipPrefixRule = {
  prefix: string;
  series: AscendSeries;
};

/** §4.1 — exact normalized chip id → A2 + dav-1001 */
export const EXACT_CHIP_RULES: ReadonlyArray<ExactChipRule> = [
  {
    chipName: 'Ascend901A',
    series: 'a2',
    npuArch: NPU_ARCH_DAV_1001,
  },
  {
    chipName: 'Ascend901B',
    series: 'a2',
    npuArch: NPU_ARCH_DAV_1001,
  },
  {
    chipName: 'Ascend910PremiumA',
    series: 'a2',
    npuArch: NPU_ARCH_DAV_1001,
  },
  {
    chipName: 'Ascend910ProA',
    series: 'a2',
    npuArch: NPU_ARCH_DAV_1001,
  },
  {
    chipName: 'Ascend910ProB',
    series: 'a2',
    npuArch: NPU_ARCH_DAV_1001,
  },
];

/** §4.2 — prefix order: 950 → 910_ → 910A → 910B */
export const CHIP_PREFIX_RULES: ReadonlyArray<ChipPrefixRule> = [
  {
    prefix: 'Ascend950',
    series: 'a5',
  },
  {
    prefix: 'Ascend910_',
    series: 'a3',
  },
  {
    prefix: 'Ascend910A',
    series: 'a2',
  },
  {
    prefix: 'Ascend910B',
    series: 'a2',
  },
];

export const ASCEND_SERIES_PROFILE: Readonly<Record<AscendSeries, AscendSeriesProfile>> = {
  a2: {
    socVersion: CANN_SOC_ASCEND_910B,
    simulatorType: SIMULATOR_ASCEND_910B3,
    npuArch: NPU_ARCH_DAV_2201,
  },
  a3: {
    socVersion: CANN_SOC_ASCEND_910_93,
    simulatorType: SIMULATOR_ASCEND_910C,
    npuArch: NPU_ARCH_DAV_2201,
  },
  a5: {
    socVersion: CANN_SOC_ASCEND_950,
    simulatorType: SIMULATOR_ASCEND_950PR_9589,
    npuArch: NPU_ARCH_DAV_3510,
  },
};

const EXACT_CHIP_BY_NORMALIZED = new Map<string, ExactChipRule>(EXACT_CHIP_RULES.map((rule) => [
  normalizeChipNameForMatching(rule.chipName),
  rule,
]));

const SLUG_TO_SERIES: Readonly<Record<string, AscendSeries>> = {
  [CANN_SOC_ASCEND_910B]: 'a2',
  [CANN_SOC_ASCEND_910]: 'a2',
  [CANN_SOC_ASCEND_310P]: 'a2',
  [CANN_SOC_ASCEND_910_93]: 'a3',
  [CANN_SOC_ASCEND_950]: 'a5',
};

const SIMULATOR_TO_SLUG: Readonly<Record<string, string>> = {
  [SIMULATOR_ASCEND_910B3.toLowerCase()]: CANN_SOC_ASCEND_910B,
  [SIMULATOR_ASCEND_910C.toLowerCase()]: CANN_SOC_ASCEND_910_93,
  [SIMULATOR_ASCEND_910.toLowerCase()]: CANN_SOC_ASCEND_910,
  [SIMULATOR_ASCEND_310P.toLowerCase()]: CANN_SOC_ASCEND_310P,
  [SIMULATOR_ASCEND_950PR_9589.toLowerCase()]: CANN_SOC_ASCEND_950,
};

const CHIP_NAME_LINE_RE = /(?:chip\s*name|芯片名称)\s*[:：]\s*(.+)\s*$/gim;
/** Fallback token: Ascend + digits/model chars; stops before unrelated words (e.g. " ok"). */
const ASCEND_TOKEN_RE = /\b(Ascend\s*\d[\dA-Za-z_]*)/gi;

let cachedDetectedChipRaw: string | undefined;

export function normalizeChipNameForMatching(chipName: string): string {
  return chipName.trim()
    .replace(/\s+/g, '');
}

export function extractChipNames(probeText: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const trimmed = raw.trim();

    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    found.push(trimmed);
  };

  for (const match of probeText.matchAll(CHIP_NAME_LINE_RE)) {
    add(match[1]);
  }

  if (found.length > 0) {
    return found;
  }

  for (const match of probeText.matchAll(ASCEND_TOKEN_RE)) {
    add(match[1]);
  }

  return found;
}

export function getExactChipRule(chipName: string): ExactChipRule | undefined {
  return EXACT_CHIP_BY_NORMALIZED.get(normalizeChipNameForMatching(chipName));
}

export function matchChipNameToSeries(chipName: string): AscendSeries | undefined {
  const exact = getExactChipRule(chipName);

  if (exact) {
    return exact.series;
  }

  const normalized = normalizeChipNameForMatching(chipName);

  for (const rule of CHIP_PREFIX_RULES) {
    if (normalized.startsWith(rule.prefix)) {
      return rule.series;
    }
  }

  return undefined;
}

export function getNpuArchForChipName(chipName: string): string | undefined {
  const exact = getExactChipRule(chipName);

  if (exact) {
    return exact.npuArch;
  }

  const series = matchChipNameToSeries(chipName);

  if (series) {
    return ASCEND_SERIES_PROFILE[series].npuArch;
  }

  return undefined;
}

export function seriesToDefaultSoc(series: AscendSeries): string {
  return ASCEND_SERIES_PROFILE[series].socVersion;
}

export function getSeriesProfile(series: AscendSeries): AscendSeriesProfile {
  return ASCEND_SERIES_PROFILE[series];
}

export function cannSocToSeries(normalizedSlug: string): AscendSeries | undefined {
  return SLUG_TO_SERIES[normalizedSlug];
}

export function simulatorTypeToCannSocSlug(simulatorType?: string | null): string | undefined {
  const key = (simulatorType || '').trim()
    .toLowerCase();

  if (!key) {
    return undefined;
  }

  return SIMULATOR_TO_SLUG[key];
}

export function getDefaultSimulatorForCannSoc(normalizedSlug: string): string | undefined {
  const series = cannSocToSeries(normalizedSlug);

  if (!series) {
    return undefined;
  }

  return ASCEND_SERIES_PROFILE[series].simulatorType;
}

export function getNpuArchForSeries(series: AscendSeries): string {
  return ASCEND_SERIES_PROFILE[series].npuArch;
}

/**
 * First matching chip in probe text → default SOC slug; caches raw chip name.
 */
export function detectSocSlugFromProbe(probeText: string): {
  socVersion: string;
  series: AscendSeries;
  chipRaw: string;
} | undefined {
  const chips = extractChipNames(probeText);

  for (const chipRaw of chips) {
    const series = matchChipNameToSeries(chipRaw);

    if (series) {
      cacheDetectedChipName(chipRaw);

      return {
        socVersion: seriesToDefaultSoc(series),
        series,
        chipRaw,
      };
    }
  }

  return undefined;
}

/** Back-compat: single chip string or probe snippet → SOC slug. */
export function detectSocSlugFromChipOrProbe(text: string): string | undefined {
  const fromProbe = detectSocSlugFromProbe(text);

  if (fromProbe) {
    return fromProbe.socVersion;
  }

  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  const series = matchChipNameToSeries(trimmed);

  if (series) {
    cacheDetectedChipName(trimmed);

    return seriesToDefaultSoc(series);
  }

  return undefined;
}

export function cacheDetectedChipName(chipRaw: string): void {
  cachedDetectedChipRaw = chipRaw;
}

export function getCachedDetectedChipName(): string | undefined {
  return cachedDetectedChipRaw;
}

export function _resetDetectedChipCacheForTest(): void {
  cachedDetectedChipRaw = undefined;
}
