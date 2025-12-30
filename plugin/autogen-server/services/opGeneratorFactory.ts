import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

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
};

class BaseOpGenerator {
  params: Params;
  project: Project;
  op_path: string;
  op_name: string | null = null;
  template_name: string | null = null;

  constructor(params: Params, project: Project, protected extensionPath: string) {
    this.params = params || {};
    this.project = project;
    this.op_path =
      this.params.op_path && path.isAbsolute(this.params.op_path) ? this.params.op_path : path.resolve(this.project.project_path, this.params.op_path || '');
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
    if (!fs.pathExistsSync(this.op_path)) return;
    const entries = fs.readdirSync(this.op_path);
    for (const name of entries) {
      const full = path.join(this.op_path, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        this._renameFilesInDir(full, templateName);
      }
      if (name.includes(templateName)) {
        const newName = name.replace(new RegExp(templateName, 'g'), this.op_name || '');
        fs.moveSync(full, path.join(this.op_path, newName), { overwrite: true });
      }
    }
  }

  _renameFilesInDir(dir: string, templateName: string) {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) this._renameFilesInDir(full, templateName);
      if (name.includes(templateName)) {
        const newName = name.replace(new RegExp(templateName, 'g'), this.op_name || '');
        fs.moveSync(full, path.join(path.dirname(full), newName), { overwrite: true });
      }
    }
  }

  _replaceContent(templateName = 'add_custom') {
    if (!fs.pathExistsSync(this.op_path)) return;
    const opName = this.op_name || '';
    const opNameCapitalized = opName
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
    const templateCap = templateName
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
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
        // only replace for text files
        try {
          let content = fs.readFileSync(full, 'utf8');
          let changed = false;
          for (const oldKey of Object.keys(replacements)) {
            if (content.includes(oldKey)) {
              content = content.split(oldKey).join(replacements[oldKey]);
              changed = true;
            }
          }
          if (changed) fs.writeFileSync(full, content, 'utf8');
        } catch (e) {
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
    this.template_name = this.params.template_name || this.template_name || 'add_custom';
    if (!opsPrototype) {
      this.op_name = this.project.project_name || path.basename(this.project.project_path);
      return this.op_name;
    }
    try {
      const raw = fs.readFileSync(opsPrototype, 'utf8');
      const json = JSON.parse(raw);
      const opInfo = Array.isArray(json) ? json[0] : json;
      this.op_name = opInfo?.op || this.project.project_name || path.basename(this.project.project_path);
      return this.op_name!;
    } catch (e) {
      throw Object.assign(new Error('Invalid op prototype'), { name: 'InvalidRequest' });
    }
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(this.extensionPath, `out/templates/code_template/ascend_template/${this.template_name}.zip`);
    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }
    execSync(`unzip -o ${templateFilePath} -d ${this.op_path}`);
    if (this.template_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }
    return true;
  }
}

class CannOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    this.op_name = this.params.op_name || this.project.project_name || path.basename(this.project.project_path);
    this.template_name = this.params.template_name || this.template_name || 'hello_world';
    return this.op_name;
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(this.extensionPath, `out/templates/code_template/cann_template/${this.template_name}.zip`);
    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }
    execSync(`unzip -o ${templateFilePath} -d ${this.op_path}`);
    if (this.template_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }
    return true;
  }
}

export const OpGeneratorFactory = {
  getGenerator(params: Params, project: Project, extensionPath: string): BaseOpGenerator {
    const opType = (params.op_type || 'ascend').toLowerCase();
    if (opType === 'cann') return new CannOpGenerator(params, project, extensionPath);
    return new AscendOpGenerator(params, project, extensionPath);
  },
};

export default OpGeneratorFactory;
