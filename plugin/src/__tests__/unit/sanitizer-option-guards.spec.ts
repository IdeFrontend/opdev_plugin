import {
  normalizeMaxDebuglogSize,
  normalizeBlockId,
  normalizeLogLevel,
  normalizeNpuSanitizerTools,
  normalizeSanitizerCommand,
  normalizeSanitizerTools,
  buildSanitizerLogFileName,
} from '@plugin/domain/services/command-strategy/sanitizer-option-guards';

describe('normalizeMaxDebuglogSize (mssanitizer range 1..10240)', () => {
  it('keeps an in-range number', () => {
    expect(normalizeMaxDebuglogSize(1024))
      .toBe(1024);
  });

  it('accepts a numeric string', () => {
    expect(normalizeMaxDebuglogSize('2048'))
      .toBe(2048);
  });

  it('keeps the boundaries 1 and 10240', () => {
    expect(normalizeMaxDebuglogSize(1))
      .toBe(1);
    expect(normalizeMaxDebuglogSize(10240))
      .toBe(10240);
  });

  it('drops 0 (the reviewer-reported invalid value)', () => {
    expect(normalizeMaxDebuglogSize(0))
      .toBeUndefined();
  });

  it('drops negatives and values above 10240', () => {
    expect(normalizeMaxDebuglogSize(-5))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(10241))
      .toBeUndefined();
  });

  it('drops empty / non-numeric / nullish', () => {
    expect(normalizeMaxDebuglogSize(''))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize('abc'))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(undefined))
      .toBeUndefined();
    expect(normalizeMaxDebuglogSize(null))
      .toBeUndefined();
  });
});

describe('normalizeBlockId (mssanitizer range 0..200)', () => {
  it('keeps in-range ids including the 0 and 200 boundaries', () => {
    expect(normalizeBlockId(0))
      .toBe(0);
    expect(normalizeBlockId(200))
      .toBe(200);
    expect(normalizeBlockId('17'))
      .toBe(17);
  });

  it('drops out-of-range and non-numeric ids', () => {
    expect(normalizeBlockId(-1))
      .toBeUndefined();
    expect(normalizeBlockId(201))
      .toBeUndefined();
    expect(normalizeBlockId(''))
      .toBeUndefined();
    expect(normalizeBlockId(undefined))
      .toBeUndefined();
    expect(normalizeBlockId(null))
      .toBeUndefined();
  });
});

describe('normalizeLogLevel (mssanitizer info|warn|error)', () => {
  it('keeps a valid level', () => {
    expect(normalizeLogLevel('info'))
      .toBe('info');
    expect(normalizeLogLevel('warn'))
      .toBe('warn');
    expect(normalizeLogLevel('error'))
      .toBe('error');
  });

  it('drops unknown levels and nullish', () => {
    expect(normalizeLogLevel('verbose'))
      .toBeUndefined();
    expect(normalizeLogLevel(''))
      .toBeUndefined();
    expect(normalizeLogLevel(undefined))
      .toBeUndefined();
  });
});

describe('normalizeSanitizerTools (mssanitizer memcheck|racecheck|initcheck|synccheck)', () => {
  it('keeps the valid tools', () => {
    expect(normalizeSanitizerTools([
      'memcheck',
      'racecheck',
      'initcheck',
      'synccheck',
    ]))
      .toEqual([
        'memcheck',
        'racecheck',
        'initcheck',
        'synccheck',
      ]);
  });

  it('drops unknown tool names', () => {
    expect(normalizeSanitizerTools([
      'memcheck',
      'bogus',
      'racecheck',
    ]))
      .toEqual([
        'memcheck',
        'racecheck',
      ]);
  });

  it('returns an empty array for no valid tools', () => {
    expect(normalizeSanitizerTools(['bogus']))
      .toEqual([]);
    expect(normalizeSanitizerTools([]))
      .toEqual([]);
  });
});

describe('normalizeNpuSanitizerTools (npu-check tool allow-list)', () => {
  it('keeps all supported npu-check tools', () => {
    expect(normalizeNpuSanitizerTools([
      'memcheck',
      'synccheck',
      'racecheck',
      'initcheck',
      'soccheck',
      'overcheck',
    ]))
      .toEqual([
        'memcheck',
        'synccheck',
        'racecheck',
        'initcheck',
        'soccheck',
        'overcheck',
      ]);
  });

  it('drops unsupported npu-check tool names', () => {
    expect(normalizeNpuSanitizerTools([
      'memcheck',
      'leak-check',
      'soccheck',
      'bogus',
      'overcheck',
    ]))
      .toEqual([
        'memcheck',
        'soccheck',
        'overcheck',
      ]);
  });
});

describe('normalizeSanitizerCommand', () => {
  it('keeps supported command names', () => {
    expect(normalizeSanitizerCommand('mssanitizer'))
      .toBe('mssanitizer');
    expect(normalizeSanitizerCommand('npu-check'))
      .toBe('npu-check');
  });

  it('defaults unknown command names to mssanitizer', () => {
    expect(normalizeSanitizerCommand('unknown'))
      .toBe('mssanitizer');
    expect(normalizeSanitizerCommand(undefined))
      .toBe('mssanitizer');
  });
});

describe('buildSanitizerLogFileName', () => {
  it('appends the -npu-check identifier for npu-check', () => {
    expect(buildSanitizerLogFileName('npu-check'))
      .toMatch(/^mssanitizer_\d+-npu-check\.log$/);
  });

  it('keeps the legacy name for mssanitizer', () => {
    expect(buildSanitizerLogFileName('mssanitizer'))
      .toMatch(/^mssanitizer_\d+\.log$/);
  });
});
