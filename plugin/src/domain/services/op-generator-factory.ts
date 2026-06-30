import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';

export type OpGenProject = {
  id?: number;
  project_path: string;
  project_name?: string;
  ascend_env_script?: string | null;
};

export type OpGenParams = {
  project_id?: number;
  op_type?: string;
  ops_prototype_file?: string | null;
  op_name?: string | null;
  template_name?: string | null;
  soc_version?: string | null;
  op_path?: string | null;
  skipExisting?: boolean;
};

/** @deprecated Use OpGenParams */
type Params = OpGenParams;
/** @deprecated Use OpGenProject */
type Project = OpGenProject;

export class BaseOpGenerator {
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

      // If skipExisting is true, only files containing the template name are renamed (these are new files extracted from the template)
      if (name.includes(templateName)) {
        const newName = name.replace(
          new RegExp(templateName, 'g'),
          this.op_name || '',
        );

        if (newName === name) {
          continue;
        }

        const newPath = path.join(this.op_path, newName);

        // If skipExisting is true and the target file already exists, skip renaming
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

      // If skipExisting is true, only files containing the template name are renamed (these are new files extracted from the template)
      if (name.includes(templateName)) {
        const newName = name.replace(
          new RegExp(templateName, 'g'),
          this.op_name || '',
        );

        if (newName === name) {
          continue;
        }

        const newPath = path.join(path.dirname(full), newName);

        // If skipExisting is true and the target file already exists, skip renaming
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

        // If skipExisting is true, only template files (those whose filename or content contains the template name) are replaced
        if (skipExisting) {
          // Check if the file contains the template name
          const fileName = path.basename(full);
          let fileContainsTemplate = fileName.includes(templateName);

          // If the file name does not contain the template name, check the file contents
          if (!fileContainsTemplate) {
            try {
              const content = fs.readFileSync(full, 'utf8');

              // Check whether the content contains template-related strings
              fileContainsTemplate = Object.keys(replacements)
                .some((key) => content.includes(key));
            }
            catch {
              // Unable to read file, skipping
              continue;
            }
          }

          // If the file does not contain template-related content, it means that the file already exists and the replacement is skipped.
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

  /**
   * Replace reserved `__MSTT_OP_NAME_*__` placeholders (longest keys first so partial matches are safe).
   * Used in templates where the operator id must track `op_name` but is not the template id string.
   */
  _replaceMsttPlaceholders() {
    if (!fs.pathExistsSync(this.op_path) || !this.op_name) {
      return;
    }

    const opName = this.op_name;
    const opNameCapitalized = opName
      .split('_')
      .map((s) => s.charAt(0)
        .toUpperCase() + s.slice(1))
      .join('');

    const replacements: Record<string, string> = {
      __MSTT_OP_NAME_PASCAL__: opNameCapitalized,
      __MSTT_OP_NAME_UPPER__: opName.toUpperCase(),
      __MSTT_OP_NAME__: opName,
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

export class AscendOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    const opsPrototype = this.params.ops_prototype_file;

    this.template_name =
      this.params.template_name || this.template_name || 'add_custom';

    if (this.params.op_name?.trim()) {
      this.op_name = this.params.op_name.trim();

      return this.op_name;
    }

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
      'out/templates/code_template/ascend_template/add_custom.zip',
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    // Unzip using adm-zip (cross-platform compatible)
    // If skipExisting is true, existing files will not be overwritten.
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // Do not overwrite existing files: extract files one by one, skip if the file already exists
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // Make sure the directory exists
            fs.ensureDirSync(entryDir);

            // Extract only if the file does not exist
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // Original logic: overwrite existing files
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    if (this.op_name) {
      this._replaceMsttPlaceholders();
    }

    OperatorPluginRegistry.getOpPlugin('ascend')
      .patchGeneratedProject(this.op_path, this.params);

    return true;
  }
}

export class CannOpGenerator extends BaseOpGenerator {
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

    // Unzip using adm-zip (cross-platform compatible)
    // If skipExisting is true, existing files will not be overwritten.
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // Do not overwrite existing files: extract files one by one, skip if the file already exists
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // Make sure the directory exists
            fs.ensureDirSync(entryDir);

            // Extract only if the file does not exist
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // Original logic: overwrite existing files
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    if (this.op_name) {
      this._replaceMsttPlaceholders();
    }

    OperatorPluginRegistry.getOpPlugin('cann')
      .patchGeneratedProject(this.op_path, this.params);

    return true;
  }
}

export class PyAscOpGenerator extends BaseOpGenerator {
  parseMeta(): string {
    this.op_name =
      this.params.op_name
      || this.project.project_name
      || path.basename(this.project.project_path);
    this.template_name = 'pyasc_template';

    return this.op_name;
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(
      this.extensionPath,
      'out/templates/code_template/cann_template/pyasc_template.zip',
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    // Unzip using adm-zip (cross-platform compatible)
    // If skipExisting is true, existing files will not be overwritten.
    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        // Do not overwrite existing files: extract files one by one, skip if the file already exists
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            // Make sure the directory exists
            fs.ensureDirSync(entryDir);

            // Extract only if the file does not exist
            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        // Original logic: overwrite existing files
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    if (this.op_name) {
      this._replaceMsttPlaceholders();
    }

    return true;
  }
}

export class TritonOpGenerator extends CannOpGenerator {
  parseMeta(): string {
    this.op_name =
      this.params.op_name
      || this.project.project_name
      || path.basename(this.project.project_path);
    this.template_name =
      this.params.template_name || this.template_name || 'triton_vector_add';

    return this.op_name;
  }

  executeGeneration(): boolean {
    const templateFilePath = path.resolve(
      this.extensionPath,
      `out/templates/code_template/triton_template/${this.template_name}.zip`,
    );

    if (!fs.pathExistsSync(templateFilePath)) {
      throw new Error(`Template file does not exist: ${templateFilePath}`);
    }

    try {
      const zip = new AdmZip(templateFilePath);
      const skipExisting = this.params.skipExisting || false;

      if (skipExisting) {
        zip.getEntries()
          .forEach((entry) => {
            if (entry.isDirectory) {
              return;
            }

            const entryPath = path.join(this.op_path, entry.entryName);
            const entryDir = path.dirname(entryPath);

            fs.ensureDirSync(entryDir);

            if (!fs.pathExistsSync(entryPath)) {
              const content = zip.readFile(entry);

              if (content) {
                fs.writeFileSync(entryPath, content);
              }
            }
          });
      }
      else {
        zip.extractAllTo(this.op_path, true);
      }
    }
    catch (error) {
      throw new Error(`Failed to extract template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (this.template_name && this.op_name) {
      this._renameFiles(this.template_name);
      this._replaceContent(this.template_name);
    }

    if (this.op_name) {
      this._replaceMsttPlaceholders();
    }

    return true;
  }
}

// Backward-compat export alias used by plugin layer.
export { TritonOpGenerator as TritonGenerator };

export const OpGeneratorFactory = {
  getGenerator(
    params: Params,
    project: Project,
    extensionPath: string,
  ): BaseOpGenerator {
    return OperatorPluginRegistry.getProjectGenerator(params, project, extensionPath);
  },
};

export default OpGeneratorFactory;
