/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import fsExtra from 'fs-extra';
import AdmZip from 'adm-zip';

const mockAscendPlugin = {
  patchGeneratedProject: jest.fn(),
  createProjectGenerator: jest.fn(),
};
const mockCannPlugin = {
  patchGeneratedProject: jest.fn(),
  createProjectGenerator: jest.fn(),
};

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({
  OperatorPluginRegistry: {
    getOpPlugin: jest.fn((opType?: string) => (opType === 'ascend' ? mockAscendPlugin : mockCannPlugin)),
    getProjectGenerator: jest.fn(),
  },
}));

import {
  BaseOpGenerator,
  AscendOpGenerator,
  CannOpGenerator,
  PyAscOpGenerator,
  TritonOpGenerator,
  OpGeneratorFactory,
  type OpGenParams,
} from '@plugin/domain/services/op-generator-factory';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';

const getOpPlugin = OperatorPluginRegistry.getOpPlugin as jest.Mock;
const getProjectGenerator = OperatorPluginRegistry.getProjectGenerator as jest.Mock;

function writeZip(zipPath: string, files: Array<[string, string]>): void {
  const zip = new AdmZip();

  for (const [
    name,
    content,
  ] of files) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }

  zip.writeZip(zipPath);
}

describe('BaseOpGenerator', () => {
  let tmpRoot: string;
  let projectPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-gen-'));
    projectPath = path.join(tmpRoot, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function makeGenerator(params: OpGenParams | undefined): BaseOpGenerator {
    const generator = new BaseOpGenerator(params as never, {
      project_path: projectPath,
      project_name: 'mul',
    }, '/extension');

    // The default test op dir must exist for the rename/replace helpers.
    if (params?.op_path === 'op') {
      fs.mkdirSync(generator.op_path, { recursive: true });
    }

    return generator;
  }

  it('keeps an absolute op_path and resolves a relative one against the project path', () => {
    const absolute = makeGenerator({ op_path: path.join(tmpRoot, 'abs') });

    expect(absolute.op_path)
      .toBe(path.join(tmpRoot, 'abs'));

    const relative = makeGenerator({ op_path: 'sub/op' });

    expect(relative.op_path)
      .toBe(path.resolve(projectPath, 'sub', 'op'));
  });

  it('defaults op_path to the project path and survives undefined params', () => {
    const generator = makeGenerator(undefined);

    expect(generator.op_path)
      .toBe(projectPath);
    expect(generator.op_name)
      .toBeNull();
  });

  it('parseMeta throws by default', () => {
    expect(() => makeGenerator({})
      .parseMeta())
      .toThrow('not implemented');
  });

  it('default executeGeneration creates the op dir and reports success', () => {
    const generator = makeGenerator({ op_path: 'gen' });

    expect(generator.executeGeneration())
      .toBe(true);
    expect(fs.existsSync(generator.op_path))
      .toBe(true);
  });

  it('_renameFiles renames template files recursively and skips plain ones', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    generator.template_name = 'add_custom';
    fs.mkdirSync(path.join(generator.op_path, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'x');
    fs.writeFileSync(path.join(generator.op_path, 'sub', 'add_custom.h'), 'y');
    fs.writeFileSync(path.join(generator.op_path, 'README.md'), 'z');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.existsSync(path.join(generator.op_path, 'mul.cpp')))
      .toBe(true);
    expect(fs.existsSync(path.join(generator.op_path, 'sub', 'mul.h')))
      .toBe(true);
    expect(fs.existsSync(path.join(generator.op_path, 'README.md')))
      .toBe(true);
    expect(fs.existsSync(path.join(generator.op_path, 'add_custom.cpp')))
      .toBe(false);
  });

  it('_renameFiles skips a template file whose own name is the target', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'add_custom';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'x');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.existsSync(path.join(generator.op_path, 'add_custom.cpp')))
      .toBe(true);
  });

  it('_renameFiles skips renames that would overwrite an existing target when skipExisting is set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'template');
    fs.writeFileSync(path.join(generator.op_path, 'mul.cpp'), 'existing');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.readFileSync(path.join(generator.op_path, 'mul.cpp'), 'utf8'))
      .toBe('existing');
  });

  it('_renameFiles is a no-op when the op dir does not exist', () => {
    const generator = makeGenerator({ op_path: 'missing' });

    expect(() => (generator as unknown as { _renameFiles(): void })._renameFiles('add_custom'))
      .not
      .toThrow();
  });

  it('_renameFiles uses the default template name when none is given', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'x');

    (generator as unknown as { _renameFiles(): void })._renameFiles();

    expect(fs.existsSync(path.join(generator.op_path, 'mul.cpp')))
      .toBe(true);
  });

  it('_renameFiles tolerates a missing op_name when skipExisting hides the target', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    fs.writeFileSync(path.join(generator.op_path, 'add_custom'), 'x');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.existsSync(path.join(generator.op_path, 'add_custom')))
      .toBe(true);
  });

  it('_renameFilesInDir recurses into nested directories', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    const inner = path.join(generator.op_path, 'sub', 'inner');

    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'add_custom.c'), 'x');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.existsSync(path.join(inner, 'mul.c')))
      .toBe(true);
  });

  it('_renameFilesInDir skips a file whose own name is already the target', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'add_custom';
    const sub = path.join(generator.op_path, 'sub');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'add_custom.h'), 'x');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.existsSync(path.join(sub, 'add_custom.h')))
      .toBe(true);
  });

  it('_renameFilesInDir tolerates a missing op_name when skipExisting hides the target', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    const sub = path.join(generator.op_path, 'sub');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'add_custom'), 'x');

    (generator as unknown as { _renameFilesInDir(d: string, t: string, s: boolean): void })._renameFilesInDir(sub, 'add_custom', true);

    expect(fs.existsSync(path.join(sub, 'add_custom')))
      .toBe(true);
  });

  it('_renameFilesInDir uses the default skipExisting when none is given', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    const sub = path.join(generator.op_path, 'sub');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'add_custom.h'), 'x');

    (generator as unknown as { _renameFilesInDir(d: string, t: string): void })._renameFilesInDir(sub, 'add_custom');

    expect(fs.existsSync(path.join(sub, 'mul.h')))
      .toBe(true);
  });

  it('_renameFilesInDir skips renames that would overwrite an existing target when skipExisting is set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    generator.op_name = 'mul';
    const sub = path.join(generator.op_path, 'sub');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'add_custom.h'), 'template');
    fs.writeFileSync(path.join(sub, 'mul.h'), 'existing');

    (generator as unknown as { _renameFiles(t: string): void })._renameFiles('add_custom');

    expect(fs.readFileSync(path.join(sub, 'mul.h'), 'utf8'))
      .toBe('existing');
  });

  it('_replaceContent replaces the template tokens in every matching file', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    fs.writeFileSync(
      path.join(generator.op_path, 'add_custom.cpp'),
      'AddCustom uses add_custom and ADD_CUSTOM',
    );

    (generator as unknown as { _replaceContent(t: string): void })._replaceContent('add_custom');

    expect(fs.readFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'utf8'))
      .toBe('Mul uses mul and MUL');
  });

  it('_replaceContent leaves unrelated files untouched when skipExisting is set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'AddCustom');
    // No template name in the filename and no template token in the content.
    fs.writeFileSync(path.join(generator.op_path, 'plain.txt'), 'untouched');

    (generator as unknown as { _replaceContent(t: string): void })._replaceContent('add_custom');

    expect(fs.readFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'utf8'))
      .toBe('Mul');
    expect(fs.readFileSync(path.join(generator.op_path, 'plain.txt'), 'utf8'))
      .toBe('untouched');
  });

  it('_replaceContent replaces files whose content carries the template tokens with skipExisting set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'plain.cpp'), 'uses AddCustom here');

    (generator as unknown as { _replaceContent(t: string): void })._replaceContent('add_custom');

    expect(fs.readFileSync(path.join(generator.op_path, 'plain.cpp'), 'utf8'))
      .toBe('uses Mul here');
  });

  it('_replaceContent tolerates a missing op_name', () => {
    const generator = makeGenerator({ op_path: 'op' });

    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'ADD_CUSTOM');

    (generator as unknown as { _replaceContent(t: string): void })._replaceContent('add_custom');

    expect(fs.readFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'utf8'))
      .toBe('');
  });

  it('_replaceContent uses the default template name when none is given', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'ADD_CUSTOM');

    (generator as unknown as { _replaceContent(): void })._replaceContent();

    expect(fs.readFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'utf8'))
      .toBe('MUL');
  });

  it('_replaceContent is a no-op when the op dir does not exist', () => {
    const generator = makeGenerator({ op_path: 'missing' });

    expect(() => (generator as unknown as { _replaceContent(): void })._replaceContent('add_custom'))
      .not
      .toThrow();
  });

  it('_replaceMsttPlaceholders replaces the reserved placeholders', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'my_op';
    fs.writeFileSync(
      path.join(generator.op_path, 'op.cfg'),
      '__MSTT_OP_NAME_PASCAL__|__MSTT_OP_NAME_UPPER__|__MSTT_OP_NAME__',
    );

    (generator as unknown as { _replaceMsttPlaceholders(): void })._replaceMsttPlaceholders();

    expect(fs.readFileSync(path.join(generator.op_path, 'op.cfg'), 'utf8'))
      .toBe('MyOp|MY_OP|my_op');
  });

  it('_replaceMsttPlaceholders is a no-op without an op_name', () => {
    const generator = makeGenerator({ op_path: 'op' });

    fs.writeFileSync(path.join(generator.op_path, 'op.cfg'), '__MSTT_OP_NAME__');

    (generator as unknown as { _replaceMsttPlaceholders(): void })._replaceMsttPlaceholders();

    expect(fs.readFileSync(path.join(generator.op_path, 'op.cfg'), 'utf8'))
      .toBe('__MSTT_OP_NAME__');
  });

  it('finalizeTemplate renames files and replaces tokens for a named operator', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    generator.template_name = 'add_custom';
    fs.writeFileSync(
      path.join(generator.op_path, 'add_custom.cpp'),
      '__MSTT_OP_NAME_UPPER__::ADD_CUSTOM',
    );

    (generator as unknown as { finalizeTemplate(): void }).finalizeTemplate();

    expect(fs.readFileSync(path.join(generator.op_path, 'mul.cpp'), 'utf8'))
      .toBe('MUL::MUL');
  });

  it('finalizeTemplate only replaces mstt placeholders when there is no template name', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.op_name = 'mul';
    fs.writeFileSync(path.join(generator.op_path, 'a.txt'), '__MSTT_OP_NAME__');

    (generator as unknown as { finalizeTemplate(): void }).finalizeTemplate();

    expect(fs.readFileSync(path.join(generator.op_path, 'a.txt'), 'utf8'))
      .toBe('mul');
  });

  it('finalizeTemplate is a no-op when the template name is set but op_name is not', () => {
    const generator = makeGenerator({ op_path: 'op' });

    generator.template_name = 'add_custom';
    fs.writeFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'ADD_CUSTOM');

    (generator as unknown as { finalizeTemplate(): void }).finalizeTemplate();

    expect(fs.readFileSync(path.join(generator.op_path, 'add_custom.cpp'), 'utf8'))
      .toBe('ADD_CUSTOM');
  });

  it('extractTemplateZip overwrites existing files by default', () => {
    const generator = makeGenerator({ op_path: 'op' });
    const zipPath = path.join(tmpRoot, 'template.zip');

    writeZip(zipPath, [
      [
        'keep.txt',
        'from-zip',
      ],
      [
        'new.txt',
        'new',
      ],
    ]);
    fs.writeFileSync(path.join(generator.op_path, 'keep.txt'), 'old');

    (generator as unknown as { extractTemplateZip(f: string): void }).extractTemplateZip(zipPath);

    expect(fs.readFileSync(path.join(generator.op_path, 'keep.txt'), 'utf8'))
      .toBe('from-zip');
    expect(fs.readFileSync(path.join(generator.op_path, 'new.txt'), 'utf8'))
      .toBe('new');
  });

  it('extractTemplateZip keeps existing files when skipExisting is set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });
    const zipPath = path.join(tmpRoot, 'template.zip');

    writeZip(zipPath, [
      [
        'keep.txt',
        'from-zip',
      ],
      [
        'nested/new.txt',
        'new',
      ],
    ]);
    fs.writeFileSync(path.join(generator.op_path, 'keep.txt'), 'old');

    (generator as unknown as { extractTemplateZip(f: string): void }).extractTemplateZip(zipPath);

    expect(fs.readFileSync(path.join(generator.op_path, 'keep.txt'), 'utf8'))
      .toBe('old');
    expect(fs.readFileSync(path.join(generator.op_path, 'nested', 'new.txt'), 'utf8'))
      .toBe('new');
  });

  it('extractTemplateZip skips directory entries when skipExisting is set', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });
    const zipPath = path.join(tmpRoot, 'template.zip');

    writeZip(zipPath, [
      [
        'subdir/',
        '',
      ],
    ]);

    (generator as unknown as { extractTemplateZip(f: string): void }).extractTemplateZip(zipPath);

    expect(fs.existsSync(path.join(generator.op_path, 'subdir')))
      .toBe(false);
  });

  it('extractTemplateZip wraps extraction failures', () => {
    const generator = makeGenerator({ op_path: 'op' });

    expect(() => (generator as unknown as { extractTemplateZip(f: string): void })
      .extractTemplateZip(path.join(tmpRoot, 'no-such.zip')))
      .toThrow(/Failed to extract template:/);
  });

  it('extractTemplateZip stringifies non-Error extraction failures', () => {
    const generator = makeGenerator({
      op_path: 'op',
      skipExisting: true,
    });
    const zipPath = path.join(tmpRoot, 'template.zip');

    writeZip(zipPath, [
      [
        'nested/a.txt',
        'x',
      ],
    ]);
    const spy = jest.spyOn(fsExtra, 'ensureDirSync')
      .mockImplementationOnce(() => {
        throw 'boom';
      });

    try {
      expect(() => (generator as unknown as { extractTemplateZip(f: string): void })
        .extractTemplateZip(zipPath))
        .toThrow('Failed to extract template: boom');
    }
    finally {
      spy.mockRestore();
    }
  });

  it('replaceFilesRecursively skips files rejected by shouldReplace', () => {
    const generator = makeGenerator({ op_path: 'op' });

    fs.writeFileSync(path.join(generator.op_path, 'a.txt'), 'TOKEN');
    fs.writeFileSync(path.join(generator.op_path, 'b.txt'), 'TOKEN');

    (generator as unknown as {
      replaceFilesRecursively(r: string, reps: Record<string, string>, cb: (p: string, c: string)=> boolean): void;
    }).replaceFilesRecursively(
      generator.op_path,
      { TOKEN: 'X' },
      (fullPath: string) => fullPath.endsWith('b.txt'),
    );

    expect(fs.readFileSync(path.join(generator.op_path, 'a.txt'), 'utf8'))
      .toBe('TOKEN');
    expect(fs.readFileSync(path.join(generator.op_path, 'b.txt'), 'utf8'))
      .toBe('X');
  });

  it('replaceFilesRecursively walks nested directories', () => {
    const generator = makeGenerator({ op_path: 'op' });
    const sub = path.join(generator.op_path, 'nested');

    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'a.txt'), 'TOKEN');

    (generator as unknown as {
      replaceFilesRecursively(r: string, reps: Record<string, string>): void;
    }).replaceFilesRecursively(generator.op_path, { TOKEN: 'X' });

    expect(fs.readFileSync(path.join(sub, 'a.txt'), 'utf8'))
      .toBe('X');
  });

  it('replaceFilesRecursively skips files that cannot be read', () => {
    const generator = makeGenerator({ op_path: 'op' });

    fs.writeFileSync(path.join(generator.op_path, 'a.txt'), 'TOKEN');
    fs.writeFileSync(path.join(generator.op_path, 'b.txt'), 'TOKEN');
    const readSpy = jest.spyOn(fsExtra, 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('EACCES');
      });

    (generator as unknown as {
      replaceFilesRecursively(r: string, reps: Record<string, string>, cb: (p: string, c: string)=> boolean): void;
    }).replaceFilesRecursively(
      generator.op_path,
      { TOKEN: 'X' },
      () => true,
    );

    readSpy.mockRestore();
    expect(fs.readFileSync(path.join(generator.op_path, 'a.txt'), 'utf8'))
      .toBe('TOKEN');
  });

  it('replaceFilesRecursively skips unreadable files in the replacement pass', () => {
    const generator = makeGenerator({ op_path: 'op' });

    fs.writeFileSync(path.join(generator.op_path, 'a.txt'), 'TOKEN');
    const readSpy = jest.spyOn(fsExtra, 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('EACCES');
      });

    (generator as unknown as {
      replaceFilesRecursively(r: string, reps: Record<string, string>): void;
    }).replaceFilesRecursively(generator.op_path, { TOKEN: 'X' });

    readSpy.mockRestore();
    expect(fs.readFileSync(path.join(generator.op_path, 'a.txt'), 'utf8'))
      .toBe('TOKEN');
  });
});

describe('AscendOpGenerator', () => {
  let tmpRoot: string;
  let extensionPath: string;
  let projectPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-gen-'));
    extensionPath = path.join(tmpRoot, 'ext');
    projectPath = path.join(tmpRoot, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function makeGenerator(params: OpGenParams): AscendOpGenerator {
    return new AscendOpGenerator(params, {
      project_path: projectPath,
      project_name: 'mul',
    }, extensionPath);
  }

  it('parseMeta trims the explicit op_name and defaults the template', () => {
    const generator = makeGenerator({
      op_name: '  mul  ',
      template_name: 'tpl',
    });

    expect(generator.parseMeta())
      .toBe('mul');
    expect(generator.template_name)
      .toBe('tpl');
  });

  it('parseMeta falls back to the project name without a prototype', () => {
    const generator = makeGenerator({});

    expect(generator.parseMeta())
      .toBe('mul');
    expect(generator.template_name)
      .toBe('add_custom');
  });

  it('parseMeta falls back to the project directory basename without a prototype or project name', () => {
    const generator = new AscendOpGenerator({}, { project_path: path.join(tmpRoot, 'plain-op') }, extensionPath);

    expect(generator.parseMeta())
      .toBe('plain-op');
  });

  it('parseMeta reads the operator id from the ops prototype file', () => {
    const prototypePath = path.join(tmpRoot, 'prototype.json');

    fs.writeFileSync(prototypePath, JSON.stringify([{ op: 'from_prototype' }]));
    const generator = makeGenerator({ ops_prototype_file: prototypePath });

    expect(generator.parseMeta())
      .toBe('from_prototype');
  });

  it('parseMeta falls back to the project name when the prototype has no op field', () => {
    const prototypePath = path.join(tmpRoot, 'prototype.json');

    fs.writeFileSync(prototypePath, '{}');
    const generator = makeGenerator({ ops_prototype_file: prototypePath });

    expect(generator.parseMeta())
      .toBe('mul');
  });

  it('parseMeta falls back to the project directory basename without a project name', () => {
    const prototypePath = path.join(tmpRoot, 'prototype.json');

    fs.writeFileSync(prototypePath, '{}');
    const generator = new AscendOpGenerator({ ops_prototype_file: prototypePath }, { project_path: path.join(tmpRoot, 'basename-op') }, extensionPath);

    expect(generator.parseMeta())
      .toBe('basename-op');
  });

  it('parseMeta throws InvalidRequest for a corrupt prototype', () => {
    const prototypePath = path.join(tmpRoot, 'prototype.json');

    fs.writeFileSync(prototypePath, 'not json');
    const generator = makeGenerator({ ops_prototype_file: prototypePath });

    expect(() => generator.parseMeta())
      .toThrow('Invalid op prototype');
    expect(() => generator.parseMeta())
      .toThrow(expect.objectContaining({ name: 'InvalidRequest' }));
  });

  it('executeGeneration fails when the template archive is missing', () => {
    const generator = makeGenerator({ op_name: 'mul' });

    expect(() => generator.executeGeneration())
      .toThrow(/Template file does not exist/);
  });

  it('executeGeneration extracts, finalizes, and patches the generated project', () => {
    const templateDir = path.join(extensionPath, 'out', 'templates', 'code_template', 'ascend_template');

    fs.mkdirSync(templateDir, { recursive: true });
    writeZip(path.join(templateDir, 'add_custom.zip'), [
      [
        'add_custom.cpp',
        '__MSTT_OP_NAME_UPPER__::ADD_CUSTOM',
      ],
    ]);
    const generator = makeGenerator({
      op_name: 'mul',
      template_name: 'add_custom',
    });

    generator.parseMeta();

    expect(generator.executeGeneration())
      .toBe(true);
    expect(fs.readFileSync(path.join(generator.op_path, 'mul.cpp'), 'utf8'))
      .toBe('MUL::MUL');
    expect(getOpPlugin)
      .toHaveBeenCalledWith('ascend');
    expect(mockAscendPlugin.patchGeneratedProject)
      .toHaveBeenCalledWith(generator.op_path, expect.objectContaining({ op_name: 'mul' }));
  });
});

describe('CannOpGenerator', () => {
  let tmpRoot: string;
  let extensionPath: string;
  let projectPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-gen-'));
    extensionPath = path.join(tmpRoot, 'ext');
    projectPath = path.join(tmpRoot, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('parseMeta defaults to the hello_world template', () => {
    const generator = new CannOpGenerator({ op_name: 'mul' }, { project_path: projectPath }, extensionPath);

    expect(generator.parseMeta())
      .toBe('mul');
    expect(generator.template_name)
      .toBe('hello_world');
  });

  it('parseMeta falls back to the project name then to the directory basename', () => {
    const byName = new CannOpGenerator({}, {
      project_path: '/proj',
      project_name: 'p',
    }, extensionPath);

    expect(byName.parseMeta())
      .toBe('p');

    const byPath = new CannOpGenerator({}, { project_path: '/proj/fallback-op' }, extensionPath);

    expect(byPath.parseMeta())
      .toBe('fallback-op');
  });

  it('executeGeneration extracts the cann template and patches the project', () => {
    const templateDir = path.join(extensionPath, 'out', 'templates', 'code_template', 'cann_template');

    fs.mkdirSync(templateDir, { recursive: true });
    writeZip(path.join(templateDir, 'hello_world.zip'), [
      [
        'hello_world.cpp',
        'HELLO_WORLD',
      ],
    ]);
    const generator = new CannOpGenerator({
      op_name: 'mul',
      template_name: 'hello_world',
    }, { project_path: projectPath }, extensionPath);

    generator.parseMeta();
    generator.executeGeneration();

    expect(fs.readFileSync(path.join(generator.op_path, 'mul.cpp'), 'utf8'))
      .toBe('MUL');
    expect(getOpPlugin)
      .toHaveBeenCalledWith('cann');
    expect(mockCannPlugin.patchGeneratedProject)
      .toHaveBeenCalled();
  });

  it('executeGeneration fails when the template archive is missing', () => {
    const generator = new CannOpGenerator({ op_name: 'mul' }, { project_path: projectPath }, extensionPath);

    generator.parseMeta();

    expect(() => generator.executeGeneration())
      .toThrow(/Template file does not exist/);
  });
});

describe('PyAscOpGenerator', () => {
  it('parseMeta pins the pyasc template', () => {
    const generator = new PyAscOpGenerator({ op_name: 'mul' }, {
      project_path: '/proj',
      project_name: 'p',
    }, '/ext');

    expect(generator.parseMeta())
      .toBe('mul');
    expect(generator.template_name)
      .toBe('pyasc_template');
  });

  it('parseMeta falls back to the project name then to the directory basename', () => {
    const byName = new PyAscOpGenerator({}, {
      project_path: '/proj',
      project_name: 'p',
    }, '/ext');

    expect(byName.parseMeta())
      .toBe('p');

    const byPath = new PyAscOpGenerator({}, { project_path: '/proj/fallback-op' }, '/ext');

    expect(byPath.parseMeta())
      .toBe('fallback-op');
  });

  it('executeGeneration fails when the template archive is missing', () => {
    const generator = new PyAscOpGenerator({ op_name: 'mul' }, {
      project_path: '/proj',
      project_name: 'p',
    }, '/ext');

    generator.parseMeta();

    expect(() => generator.executeGeneration())
      .toThrow(/Template file does not exist/);
  });

  it('executeGeneration extracts the pyasc template without patching', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-gen-'));
    const extensionPath = path.join(tmpRoot, 'ext');
    const templateDir = path.join(extensionPath, 'out', 'templates', 'code_template', 'cann_template');
    const projectPath = path.join(tmpRoot, 'proj');

    fs.mkdirSync(templateDir, { recursive: true });
    writeZip(path.join(templateDir, 'pyasc_template.zip'), [
      [
        'pyasc_template.py',
        '__MSTT_OP_NAME__',
      ],
    ]);
    const generator = new PyAscOpGenerator({ op_name: 'mul' }, { project_path: projectPath }, extensionPath);

    generator.parseMeta();
    expect(generator.executeGeneration())
      .toBe(true);
    expect(fs.readFileSync(path.join(generator.op_path, 'mul.py'), 'utf8'))
      .toBe('mul');
    expect(getOpPlugin)
      .not
      .toHaveBeenCalled();
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });
});

describe('TritonOpGenerator / OpGeneratorFactory', () => {
  it('parseMeta defaults to the triton_vector_add template', () => {
    const generator = new TritonOpGenerator({ op_name: 'mul' }, { project_path: '/proj' }, '/ext');

    expect(generator.parseMeta())
      .toBe('mul');
    expect(generator.template_name)
      .toBe('triton_vector_add');
  });

  it('parseMeta falls back to the project name then to the directory basename', () => {
    const byName = new TritonOpGenerator({}, {
      project_path: '/proj',
      project_name: 'p',
    }, '/ext');

    expect(byName.parseMeta())
      .toBe('p');

    const byPath = new TritonOpGenerator({}, { project_path: '/proj/fallback-op' }, '/ext');

    expect(byPath.parseMeta())
      .toBe('fallback-op');
  });

  it('executeGeneration fails when the template archive is missing', () => {
    const generator = new TritonOpGenerator({ op_name: 'mul' }, {
      project_path: '/proj',
      project_name: 'p',
    }, '/ext');

    generator.parseMeta();

    expect(() => generator.executeGeneration())
      .toThrow(/Template file does not exist/);
  });

  it('executeGeneration extracts the triton template without patching', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-gen-'));
    const extensionPath = path.join(tmpRoot, 'ext');
    const templateDir = path.join(extensionPath, 'out', 'templates', 'code_template', 'triton_template');
    const projectPath = path.join(tmpRoot, 'proj');

    fs.mkdirSync(templateDir, { recursive: true });
    writeZip(path.join(templateDir, 'custom_name.zip'), [
      [
        'custom_name.py',
        '__MSTT_OP_NAME_UPPER__',
      ],
    ]);
    const generator = new TritonOpGenerator({
      op_name: 'mul',
      template_name: 'custom_name',
    }, { project_path: projectPath }, extensionPath);

    generator.parseMeta();
    expect(generator.executeGeneration())
      .toBe(true);
    expect(fs.readFileSync(path.join(generator.op_path, 'mul.py'), 'utf8'))
      .toBe('MUL');
    expect(getOpPlugin)
      .not
      .toHaveBeenCalled();
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('OpGeneratorFactory delegates to the plugin registry', () => {
    const params: OpGenParams = { op_name: 'mul' };
    const project = { project_path: '/proj' };
    const generator = new BaseOpGenerator(params, project, '/ext');

    getProjectGenerator.mockReturnValue(generator);

    expect(OpGeneratorFactory.getGenerator(params, project, '/ext'))
      .toBe(generator);
    expect(getProjectGenerator)
      .toHaveBeenCalledWith(params, project, '/ext');
  });
});
