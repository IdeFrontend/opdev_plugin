import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';

type Project = {
  id?: number;
  project_path: string;
  project_name?: string;
  ascend_env_script?: string | null;
};

type Params = {
  project_id?: number;
  op_type?: string;
  ops_prototype_file?: string | null;
  op_name?: string | null;
  template_name?: string | null;
  soc_version?: string | null;
  op_path?: string | null;
  skipExisting?: boolean; // 是否跳过已有文件
};

class BaseOpGenerator {
  params: Params;
  project: Project;
  op_path: string;
  op_name: string | null = null;
  template_name: string | null = null;

  constructor(
    params: Params,
    project: Project,
    protected extensionPath: string,
  ) {
    this.params = params || {};
    this.project = project;
    this.op_path =
      this.params.op_path && path.isAbsolute(this.params.op_path)
        ? this.params.op_path
        : path.resolve(this.project.project_path, this.params.op_path || '');
    this.template_name = this.params.template_name || null;
  }

  parseMeta(): string {
    throw new Error('not implemented');
  }

  executeGeneration(): boolean {
    // default: ensure dir exists and return true
    fs.ensureDirSync(this.op_path);

    return true;
  }

  // helpers
  _renameFiles(templateName = 'add_custom') {
    if (!fs.pathExistsSync(this.op_path)) {
      return;
    }

    const skipExisting = this.params.skipExisting || false;
    const entries = fs.readdirSync(this.op_path);

    for (const name of entries) {
      const full = path.join(this.op_path, name);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        this._renameFilesInDir(full, templateName, skipExisting);
        continue;
      }

      // 如果 skipExisting 为 true，只重命名包含模板名称的文件（这些是从模板解压的新文件）
      if (name.includes(templateName)) {
        const newName = name.replace(
          new RegExp(templateName, 'g'),
          this.op_name || '',
        );
        const newPath = path.join(this.op_path, newName);

        // 如果 skipExisting 为 true，且目标文件已存在，则跳过重命名
        if (skipExisting && fs.pathExistsSync(newPath)) {
          continue;
        }

        fs.moveSync(full, newPath, { overwrite: !skipExisting });
      }
    }
  }

  _renameFilesInDir(dir: string, templateName: string, skipExisting: boolean = false) {
    const entries = fs.readdirSync(dir);

    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        this._renameFilesInDir(full, templateName, skipExisting);
        continue;
      }

      // 如果 skipExisting 为 true，只重命名包含模板名称的文件（这些是从模板解压的新文件）
      if (name.includes(templateName)) {
        const newName = name.replace(
          new RegExp(templateName, 'g'),
          this.op_name || '',
        );
        const newPath = path.join(path.dirname(full), newName);

        // 如果 skipExisting 为 true，且目标文件已存在，则跳过重命名
        if (skipExisting && fs.pathExistsSync(newPath)) {
          continue;
        }

        fs.moveSync(full, newPath, { overwrite: !skipExisting });
      }
    }
  }

  _replaceContent(templateName = 'add_custom') {
    if (!fs.pathExistsSync(this.op_path)) {
      return;
    }

    const skipExisting = this.params.skipExisting || false;
    const opName = this.op_name || '';
    const opNameCapitalized = opName
      .split('_')
      .map((s) => s.charAt(0)
        .toUpperCase() + s.slice(1))
      .join('');
    const templateCap = templateName
      .split('_')
      .map((s) => s.charAt(0)
        .toUpperCase() + s.slice(1))
      .join('');

    const replacements: Record<string, string> = {
      [templateName.toUpperCase()]: opName.toUpperCase(),
      [templateCap]: opNameCapitalized,
      [templateName]: opName,
    };

    const walk = (dir: string) => {
      const names = fs.readdirSync(dir);

      for (const name of names) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);

        if (stat.isDirectory()) {
          walk(full);
          continue;
        }

        // 如果 skipExisting 为 true，只替换模板文件（文件名或内容包含模板名称的文件）
        if (skipExisting) {
          // 检查文件是否包含模板名称
          const fileName = path.basename(full);
          let fileContainsTemplate = fileName.includes(templateName);

          // 如果文件名不包含模板名称，检查文件内容
          if (!fileContainsTemplate) {
            try {
              const content = fs.readFileSync(full, 'utf8');

              // 检查内容是否包含模板相关的字符串
              fileContainsTemplate = Object.keys(replacements)
                .some((key) => content.includes(key));
            }
            catch {
              // 无法读取文件，跳过
              continue;
            }
          }

          // 如果文件不包含模板相关内容，说明是已有文件，跳过替换
          if (!fileContainsTemplate) {
            continue;
          }
        }

        // only replace for text files
        try {
          let content = fs.readFileSync(full, 'utf8');
          let changed = false;

          for (const oldKey of Object.keys(replacements)) {
            if (content.includes(oldKey)) {
              content = content.split(oldKey)
                .join(replacements[oldKey]);
              changed = true;
            }
          }

          if (changed) {
            fs.writeFileSync(full, content, 'utf8');
          }
        }
        catch {
          // skip binary or unreadable files
        }
      }
    };

    walk(this.op_path);
  }
}

class AscendOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    const opsPrototype = this.params.ops_prototype_file;

    this.template_name =
      this.params.template_name || this.template_name || 'add_custom';

    if (!opsPrototype) {
      this.op_name =
        this.project.project_name || path.basename(this.project.project_path);

      return this.op_name;
    }

    try {
      const raw = fs.readFileSync(opsPrototype, 'utf8');
      const json = JSON.parse(raw);
      const opInfo = Array.isArray(json) ? json[0] : json;

      this.op_name =
        opInfo?.op
        || this.project.project_name
        || path.basename(this.project.project_path);

      return this.op_name!;
    }
    catch {
      throw Object.assign(new Error('Invalid op prototype'), { name: 'InvalidRequest' });
    }
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(
      this.extensionPath,
      `out/templates/code_template/ascend_template/add_custom.zip`,
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    // 使用 adm-zip 解压缩（跨平台兼容）
    // 如果 skipExisting 为 true，则不覆盖已有文件
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // 不覆盖已有文件：逐个提取文件，如果文件已存在则跳过
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // 确保目录存在
            fs.ensureDirSync(entryDir);

            // 如果文件不存在，才提取
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // 原有逻辑：覆盖已有文件
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.template_name != this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    return true;
  }
}

class CannOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    this.op_name =
      this.params.op_name
      || this.project.project_name
      || path.basename(this.project.project_path);
    this.template_name =
      this.params.template_name || this.template_name || 'hello_world';

    return this.op_name;
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(
      this.extensionPath,
      `out/templates/code_template/cann_template/${this.template_name}.zip`,
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    // 使用 adm-zip 解压缩（跨平台兼容）
    // 如果 skipExisting 为 true，则不覆盖已有文件
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // 不覆盖已有文件：逐个提取文件，如果文件已存在则跳过
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // 确保目录存在
            fs.ensureDirSync(entryDir);

            // 如果文件不存在，才提取
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // 原有逻辑：覆盖已有文件
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.template_name != this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    return true;
  }
}

class PyAscOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    this.op_name =
      this.params.op_name
      || this.project.project_name
      || path.basename(this.project.project_path);
    this.template_name = 'pyasc_temple';

    return this.op_name;
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(
      this.extensionPath,
      `out/templates/code_template/cann_template/pyasc_temple.zip`,
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    // 使用 adm-zip 解压缩（跨平台兼容）
    // 如果 skipExisting 为 true，则不覆盖已有文件
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // 不覆盖已有文件：逐个提取文件，如果文件已存在则跳过
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // 确保目录存在
            fs.ensureDirSync(entryDir);

            // 如果文件不存在，才提取
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // 原有逻辑：覆盖已有文件
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.template_name != this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    return true;
  }
}

export const OpGeneratorFactory = {
  getGenerator(
    params: Params,
    project: Project,
    extensionPath: string,
  ): BaseOpGenerator {
    const opType = (params.op_type || 'ascend').toLowerCase();

    if (opType === 'cann') {
      return new CannOpGenerator(params, project, extensionPath);
    }

    if (opType === 'pyasc') {
      return new PyAscOpGenerator(params, project, extensionPath);
    }

    return new AscendOpGenerator(params, project, extensionPath);
  },
};

export default OpGeneratorFactory;
