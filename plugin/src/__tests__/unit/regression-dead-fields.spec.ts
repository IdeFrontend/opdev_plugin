/**
 * Grep assertions that dead code stays absent from the source tree. The
 * store-shape assertions previously lived in the registry specs (projects.json
 * / ops.json / configs.json); the project record is now synthesized from
 * workspace settings + cache, so there are no stored rows left to check.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('regression: dead code stays absent from the source tree', () => {
  const srcRoot = path.join(__dirname, '..', '..');

  it('ExtensionConfig class file is absent from the source tree', () => {
    expect(fs.existsSync(path.join(srcRoot, 'core', 'extension-config.ts')))
      .toBe(false);
  });

  it('Project.projectSH getter is absent', () => {
    const projectTs = fs.readFileSync(path.join(srcRoot, 'core', 'project', 'project.ts'), 'utf8');

    expect(projectTs).not.toContain('projectSH');
  });

  it('dead globalState writes are absent', () => {
    const welcome = fs.readFileSync(path.join(srcRoot, 'controller', 'welcome-controller.ts'), 'utf8');

    // Comments may mention RemoteConfig by name; the dead API usage
    // (getInstance) must be absent.
    expect(welcome).not.toContain('RemoteConfig.getInstance');

    const webview = fs.readFileSync(path.join(srcRoot, 'class', 'webview-provider.ts'), 'utf8');

    expect(webview).not.toContain('userInfo');
  });

  it('remote-config.ts helper is absent from the source tree', () => {
    expect(fs.existsSync(path.join(srcRoot, 'helpers', 'remote-config.ts')))
      .toBe(false);
  });
});
