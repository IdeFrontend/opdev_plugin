import type { OperatorProjectViewIdValue } from '@shared/project-type-view-id';
import { OperatorProjectViewId } from '@shared/project-type-view-id';

import type { PreviewEntry } from './seti-file-icon';

export const TEMPLATE_PREVIEW_FILES = {
  helloworld: [
    '.gitignore',
    'build.sh',
    'CMakeLists.txt',
    'hello_world.asc',
    'README.md',
  ],
  addn: [
    '.gitignore',
    'build.sh',
    'CMakeLists.txt',
    'addn_custom.asc',
    'README.md',
  ],
  torch_library_template: [
    '.gitignore',
    'build.sh',
    'CMakeLists.txt',
    'README.md',
    'run.py',
    'torch_library.asc',
  ],
  triton_vector_add: [
    'README.md',
    'triton_vector_add.py',
  ],
  pyasc: [
    'pyasc_template.py',
    'README.md',
  ],
  standard_custom: [
    {
      name: 'math',
      depth: 0,
      folder: 'expanded',
    },
    {
      name: 'abs',
      depth: 1,
      folder: 'expanded',
    },
    {
      name: 'op_graph',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'op_host',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'op_kernel',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'CMakeLists.txt',
      depth: 2,
    },
    {
      name: 'add',
      depth: 1,
      folder: 'expanded',
    },
    {
      name: 'op_graph',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'op_host',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'op_kernel',
      depth: 2,
      folder: 'collapsed',
    },
    {
      name: 'CMakeLists.txt',
      depth: 2,
    },
    {
      name: 'CMakeLists.txt',
      depth: 1,
    },
    {
      name: 'build.sh',
      depth: 0,
    },
  ],
} as const satisfies Record<string, PreviewEntry[]>;

export type TemplatePreviewName = keyof typeof TEMPLATE_PREVIEW_FILES;

export function getTemplatePreviewFiles(template: string): PreviewEntry[] | undefined {
  if (Object.prototype.hasOwnProperty.call(TEMPLATE_PREVIEW_FILES, template)) {
    return [...TEMPLATE_PREVIEW_FILES[template as TemplatePreviewName]];
  }

  return undefined;
}

export function getProjectPreviewFiles(
  projectTypeId: OperatorProjectViewIdValue,
  cannTemplate?: string,
): PreviewEntry[] | undefined {
  if (projectTypeId === OperatorProjectViewId.CANN) {
    return cannTemplate ? getTemplatePreviewFiles(cannTemplate) : undefined;
  }

  if (projectTypeId === OperatorProjectViewId.TRITON) {
    return [...TEMPLATE_PREVIEW_FILES.triton_vector_add];
  }

  if (projectTypeId === OperatorProjectViewId.PYASC) {
    return [...TEMPLATE_PREVIEW_FILES.pyasc];
  }

  if (projectTypeId === OperatorProjectViewId.STANDARD_CUSTOM) {
    return [...TEMPLATE_PREVIEW_FILES.standard_custom];
  }

  return undefined;
}
