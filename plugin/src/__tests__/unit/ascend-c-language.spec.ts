import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

type LanguageContribution = {
  id: string;
  aliases?: string[];
  extensions?: string[];
  icon?: {
    light?: string;
    dark?: string;
  };
};

type GrammarContribution = {
  language: string;
  scopeName: string;
  path: string;
};

function loadManifest(): {
  contributes?: {
    languages?: LanguageContribution[];
    grammars?: GrammarContribution[];
    configurationDefaults?: {
      'files.associations'?: Record<string, string>;
    };
  };
} {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
}

describe('Ascend C language contribution', () => {
  it('registers the ascend-c language for .asc files', () => {
    const manifest = loadManifest();

    expect(manifest.contributes?.languages)
      .toEqual([
        {
          id: 'ascend-c',
          aliases: [
            'Ascend C',
            'ascend-c',
          ],
          extensions: ['.asc'],
          icon: {
            light: './out/web/branding/language-ascend-c.svg',
            dark: './out/web/branding/language-ascend-c.svg',
          },
        },
      ]);
  });

  it('ships the fallback icon as a copy of the built-in C++ file icon glyph', () => {
    const manifest = loadManifest();
    const icon = manifest.contributes?.languages?.[0]?.icon;

    expect(icon?.light)
      .toBe('./out/web/branding/language-ascend-c.svg');
    expect(icon?.dark)
      .toBe(icon?.light);

    // The icon lives with the other branding SVGs: the default source plus a
    // copy in each flavor branding dir, so the flavor builds package it too.
    const iconSources = [
      path.join(REPO_ROOT, 'web', 'src', 'assets', 'branding', 'language-ascend-c.svg'),
      path.join(REPO_ROOT, 'flavors', 'huawei', 'branding', 'language-ascend-c.svg'),
      path.join(REPO_ROOT, 'flavors', 'ascend-c-toolkit', 'branding', 'language-ascend-c.svg'),
    ];

    for (const iconPath of iconSources) {
      expect(fs.existsSync(iconPath))
        .toBe(true);
    }

    const svg = fs.readFileSync(iconSources[0], 'utf8');

    // The icon is the Seti C++ file glyph (U+E01A) with the theme's own
    // color, cropped the same way the theme crops its font glyph (150% font
    // size in a 16px box), so it looks identical to the C++ entries.
    expect(svg)
      .toContain('fill="#519aba"');
    expect(svg)
      .toContain('viewBox="89.74 89.74 820.51 820.51"');
    expect((svg.match(/M\d/g) ?? []).length)
      .toBeGreaterThan(0);
  });

  it('ships a grammar that reuses the built-in C++ grammar', () => {
    const manifest = loadManifest();
    const grammar = manifest.contributes?.grammars?.[0];

    expect(grammar?.language)
      .toBe('ascend-c');
    expect(grammar?.scopeName)
      .toBe('source.ascend-c');

    const grammarPath = path.join(REPO_ROOT, grammar?.path ?? '');

    expect(fs.existsSync(grammarPath))
      .toBe(true);

    const parsed = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as {
      scopeName?: string;
      patterns?: Array<{ include?: string }>;
    };

    expect(parsed.scopeName)
      .toBe('source.ascend-c');
    expect(parsed.patterns?.map((pattern) => pattern.include))
      .toContain('source.cpp');
  });

  it('whitelists the grammar directory in the package', () => {
    const ignoreRules = fs.readFileSync(path.join(REPO_ROOT, '.vscodeignore'), 'utf8');

    expect(ignoreRules)
      .toContain('!syntaxes/**');
  });

  it('keeps the default *.asc association to cpp for C/C++ IntelliSense', () => {
    // configurationDefaults must keep mapping .asc to cpp: C/C++ IntelliSense
    // activates per language id, and the Ascend C picker entry is an option,
    // not a replacement for the C++ tooling.
    const manifest = loadManifest();

    expect(manifest.contributes?.configurationDefaults?.['files.associations'])
      .toEqual({
        '*.asc': 'cpp',
        '*.cce': 'cpp',
      });
  });
});
