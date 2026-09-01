import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CURRENT_GUIDE_URL = 'https://gitcode.com/opdevtools/plugin_release';
const OUTDATED_DISCUSSION_URL = 'https://gitcode.com/org/cann/discussions/54';

const userFacingHelpFiles = [
  'plugin/src/extension.ts',
  'web/src/views/sidebars/home/app.vue',
  'plugin/templates/code_template/cann_template/addn_custom/README.md',
  'plugin/templates/code_template/cann_template/hello_world/README.md',
  'plugin/templates/code_template/cann_template/torch_library_template/README.md',
];

describe('plugin release help links', () => {
  it('routes packaged help entrypoints and template docs to the maintained plugin_release guide', () => {
    const staleFiles = userFacingHelpFiles.filter((relativePath) => {
      const content = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

      return content.includes(OUTDATED_DISCUSSION_URL) || !content.includes(CURRENT_GUIDE_URL);
    });

    expect(staleFiles)
      .toEqual([]);
  });
});
