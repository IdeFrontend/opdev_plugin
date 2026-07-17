import {
  DEFAULT_GEN_OP_COMMAND,
  buildGenOpCommand,
  genopProducedOperatorSource,
  decideSkipFileGeneration,
} from '@plugin/domain/utils/genop-command';

describe('genop-command helper', () => {
  describe('DEFAULT_GEN_OP_COMMAND', () => {
    it('matches the template requested in issue #14', () => {
      expect(DEFAULT_GEN_OP_COMMAND)
        .toBe('bash build.sh --genop={path}/{operatorname}');
    });
  });

  describe('buildGenOpCommand', () => {
    it('substitutes {path} and {operatorname} without quoting plain paths', () => {
      expect(buildGenOpCommand(DEFAULT_GEN_OP_COMMAND, '/mnt/workspace/ops-math/math', 'tttt'))
        .toBe('bash build.sh --genop=/mnt/workspace/ops-math/math/tttt');
    });

    it('handles relative paths (relative to collection root)', () => {
      expect(buildGenOpCommand(DEFAULT_GEN_OP_COMMAND, 'math', 'add_custom'))
        .toBe('bash build.sh --genop=math/add_custom');
    });

    it('handles nested relative paths (e.g. experimental/math)', () => {
      expect(buildGenOpCommand(DEFAULT_GEN_OP_COMMAND, 'experimental/math', 'add_custom'))
        .toBe('bash build.sh --genop=experimental/math/add_custom');
    });

    it('handles current-dir relative path (.) when projectPath equals collectionRoot', () => {
      expect(buildGenOpCommand(DEFAULT_GEN_OP_COMMAND, '.', 'top_level_op'))
        .toBe('bash build.sh --genop=./top_level_op');
    });

    it('quotes only the value that contains spaces', () => {
      expect(buildGenOpCommand(DEFAULT_GEN_OP_COMMAND, '/mnt/work space/ops-math/math', 'tttt'))
        .toBe('bash build.sh --genop="/mnt/work space/ops-math/math"/tttt');
    });

    it('quotes values containing shell-special characters', () => {
      expect(buildGenOpCommand('{path}', '/a/$x', 'op'))
        .toBe('"/a/\\$x"');
    });

    it('replaces every occurrence of a placeholder', () => {
      expect(buildGenOpCommand('{operatorname} {operatorname}', '/p', 'op'))
        .toBe('op op');
    });

    it('does not expand replacement-string specials ($&) in substituted values', () => {
      // Regression: String.replace treats $& in the replacement string as the matched
      // text. The substituted value must be inserted literally (function replacer).
      expect(buildGenOpCommand('{path}', '$&', 'x'))
        .toBe('"\\$&"');
    });
  });

  describe('genopProducedOperatorSource', () => {
    const withFiles = (present: string[]) => ({ existsSync: (p: string) => present.includes(p.replace(/\\/g, '/')) });

    it('is false when the operator dir does not exist', () => {
      expect(genopProducedOperatorSource('/op/dir', withFiles([])))
        .toBe(false);
    });

    it('is false when the dir exists but has no source signature', () => {
      expect(genopProducedOperatorSource('/op/dir', withFiles(['/op/dir'])))
        .toBe(false);
    });

    it('is true when CMakeLists.txt is present', () => {
      expect(genopProducedOperatorSource('/op/dir', withFiles([
        '/op/dir',
        '/op/dir/CMakeLists.txt',
      ])))
        .toBe(true);
    });

    it('is true when an op_host directory is present', () => {
      expect(genopProducedOperatorSource('/op/dir', withFiles([
        '/op/dir',
        '/op/dir/op_host',
      ])))
        .toBe(true);
    });
  });

  describe('decideSkipFileGeneration', () => {
    const present = (paths: string[]) => (p: string) => paths.includes(p.replace(/\\/g, '/'));

    it('is false when the command did not succeed, even if files exist', () => {
      expect(decideSkipFileGeneration({
        commandSucceeded: false,
        opDir: '/op/dir',
        existsSync: present([
          '/op/dir',
          '/op/dir/CMakeLists.txt',
        ]),
      }))
        .toBe(false);
    });

    it('is false when the command succeeded but produced no source', () => {
      expect(decideSkipFileGeneration({
        commandSucceeded: true,
        opDir: '/op/dir',
        existsSync: present(['/op/dir']),
      }))
        .toBe(false);
    });

    it('is true only when the command succeeded AND source is present', () => {
      expect(decideSkipFileGeneration({
        commandSucceeded: true,
        opDir: '/op/dir',
        existsSync: present([
          '/op/dir',
          '/op/dir/op_host',
        ]),
      }))
        .toBe(true);
    });
  });
});
