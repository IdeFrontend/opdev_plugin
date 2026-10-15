/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Lifecycle-parity fixtures.
 *
 * Two kinds of fixtures:
 *  - CREATION_CASES: params for `welcomeMethods.createdProject`, one per creation
 *    type (cann / ascend add_custom / pyasc / triton / torch_library /
 *    standard-custom sub-op). The harness runs the REAL creation flow into a
 *    fresh temp workspace.
 *  - OPEN_CASES: per-type "open a project that already has store files on disk"
 *    scenario (the importer-relevant stored baseline). The harness seeds
 *    projects/configs/ops.json (user_data_dir/data) plus a real project directory
 *    with type-specific marker files, then runs the activation sequence
 *    (detectAndRegisterWorkspace + welcomeMethods.openProject + the settings step).
 *
 * Everything here is deterministic on the stored baseline: seeded ids are fixed,
 * all timestamps are normalized by the harness before snapshotting.
 *
 * Open cases seed the FULL per-type configs.json row set (the importer
 * hydrates settings/cache from it) and the standard-custom project row carries
 * the design-mandated scan state (isCompiled:true + selected ids 10001).
 */
import * as path from 'path';

export type CreationCase = {
  /** Stable snapshot id (also the expected JSON file name). */
  id: string;
  viewId: number;
  projectName: string;
  templateName?: string;
  /** Seed a standard-custom collection record at the workspace root. */
  seedCollection?: boolean;
};

export const CREATION_CASES: CreationCase[] = [
  {
    id: 'cann',
    viewId: 1,
    projectName: 'op_add',
    templateName: 'hello_world',
  },
  {
    id: 'ascend',
    viewId: 2,
    projectName: 'op_add',
    templateName: 'add_custom',
  },
  {
    id: 'pyasc',
    viewId: 3,
    projectName: 'op_add',
  },
  {
    id: 'triton',
    viewId: 4,
    projectName: 'op_add',
    templateName: 'triton_vector_add',
  },
  {
    id: 'torch_library',
    viewId: 1,
    projectName: 'op_add',
    templateName: 'torch_library_template',
  },
  {
    id: 'standard_custom',
    viewId: 2,
    projectName: 'add',
    seedCollection: true,
  },
] as const;

export type OpenCase = {
  id: string;
  /** project_type stored in projects.json (canonical stored value per type). */
  projectType: string;
  /** op_type of the seeded ops.json row. */
  opType: string;
  templateName: string | null;
  /** Relative marker files that make the project directory realistic per type. */
  markers: Record<string, string>;
};

export const OPEN_CASES: OpenCase[] = [
  {
    id: 'cann',
    projectType: 'cann',
    opType: 'cann',
    templateName: null,
    markers: {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(op_add)\n',
      'add.asc': '// kernel placeholder\n',
    },
  },
  {
    id: 'ascend',
    projectType: 'ascend',
    opType: 'ascend',
    templateName: null,
    markers: {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(op_add)\n',
      'op_host/op_api/aclnn_add_custom.cpp': '#include "aclnn_add_custom.h"\n',
    },
  },
  {
    id: 'pyasc',
    projectType: 'pyasc',
    opType: 'pyasc',
    templateName: null,
    markers: {
      'op_add.py': 'import acl\n\ndef main():\n    pass\n',
      'README.md': '# op_add\n',
    },
  },
  {
    id: 'triton',
    projectType: 'triton',
    opType: 'triton',
    templateName: null,
    markers: { 'op_add.py': 'import triton\nimport triton.language as tl\n\n@triton.jit\ndef add_kernel():\n    pass\n' },
  },
  {
    id: 'torch_library',
    projectType: 'cann',
    opType: 'cann',
    templateName: 'torch_library_template',
    markers: {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(torch_lib)\n',
      'run.py': 'import torch\n',
    },
  },
  {
    id: 'standard_custom',
    projectType: 'ascend',
    opType: 'ascend',
    templateName: null,
    markers: {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(op_collection)\n',
      'math/add/CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(add)\n',
    },
  },
] as const;

/**
 * Seed projects.json rows. `project_path` is resolved by the harness against the
 * temp root; every other field mirrors what the stored rows carry. The
 * standard-custom row seeds the design-mandated scan state (add isCompiled:true,
 * sub isCompiled:false, selected ids 10001 → sub) so the importer's id formula
 * hydrates cache.json; updateStandardCustomOperators preserves isCompiled via its
 * name-keyed map.
 */
export function seedProjectRow(openCase: OpenCase, projectDir: string) {
  const standardCustom = openCase.id === 'standard_custom';

  return {
    id: 1,
    project_name: standardCustom ? 'op_collection' : 'op_project',
    project_path: projectDir,
    template_name: openCase.templateName,
    project_type: openCase.projectType,
    ascend_env_script: '/etc/profile',
    soc_version: null,
    ops_meet: standardCustom
      ? [
        {
          name: 'math',
          path: path.join(projectDir, 'math'),
        },
      ]
      : null,
    ops_list: standardCustom
      ? [
        {
          name: 'add',
          path: path.join(projectDir, 'math', 'add'),
          isCompiled: true,
        },
        {
          name: 'sub',
          path: path.join(projectDir, 'math', 'sub'),
          isCompiled: false,
        },
      ]
      : null,
    experimental_ops_list: standardCustom ? [] : null,
    selected_operator_ids: standardCustom ? [10001] : null,
  };
}

/** Seed ops.json rows (the operator whose default configs completeProjectConfigs ensures). */
export function seedOpRow(openCase: OpenCase, projectDir: string) {
  return {
    id: 1,
    project_id: 1,
    op_name: 'op_project',
    op_type: openCase.opType,
    op_path: projectDir,
    template_name: openCase.templateName,
  };
}

/**
 * npu_debug_script shell line as stored in the triton open etalon. Backslashes
 * and quotes are kept verbatim (template literal with escaped backslashes) so
 * the seeded store is byte-identical to the committed baseline.
 */
const TRITON_NPU_DEBUG = 'TRITON_DISABLE_CACHE=1 TRITON_DISABLE_LINE_INFO=false LLVM_EXTRACT_DI_LOCAL_VARIABLES=1 python3 ./op_project.py && sh -c \'K=$(find "$HOME/.triton/cache" -type f -name \'op_project.npubin\' -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); [ -z "$K" ] && K=$(find "$HOME/.triton/cache" -type f \\( -name \'*.npubin\' -o -name kernel.o -o -name kernel_reloc.o \\) -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); [ -z "$K" ] && exit 0; d="$PWD"; while [ "$d" != "/" ]; do for cfg in .vscode .arts; do if [ -d "$d/$cfg" ]; then printf "%s\\n" "$K" > "$d/$cfg/.triton_launch_kernel_path"; exit 0; fi; done; d=$(dirname "$d"); done\'';

/** Sanitizer user_options payload (byte-identical to the open etalon rows). */
const SANITIZER_OPTIONS = {
  tool: {
    memcheck: true,
    racecheck: true,
    initcheck: true,
    synccheck: false,
  },
  memcheckOption: {
    'check-unused-memory': true,
    'leak-check': true,
    'check-device-heap': false,
    'check-cann-heap': false,
  },
  logLevel: 'warn',
  maxDebuglogSize: 1024,
  useBlock: false,
  blockId: null,
  fileMapList: [],
};

/** on_board user_options payload (byte-identical to the open etalon rows). */
const ON_BOARD_METRICS = {
  Occupancy: true,
  Roofline: true,
  Source: true,
  MemoryDetail: true,
  PCSampling: false,
  ArithmeticUtilization: true,
  L2Cache: true,
  Memory: true,
  MemoryL0: true,
  MemoryUB: true,
  PipeUtilization: true,
  ResourceConflictRatio: true,
  KernelScale: false,
  advance_param: [],
  fileMapList: [],
};

/** simulate user_options payload (byte-identical to the open etalon rows). */
const SIMULATE_OPTIONS = {
  ResourceConflictRatio: true,
  PMSampling: false,
  simulatorType: 'Ascend910B3',
  advance_param: [],
  fileMapList: [],
};

type ConfigRowSeed = {
  id: number
  configType: string
  script: string
  target: string | null
  /** user_options EXCLUDING `op` (inserted first, mirroring the etalon key order). */
  userOptions: Record<string, unknown>
};

function toConfigRow(seed: ConfigRowSeed): Record<string, unknown> {
  return {
    id: seed.id,
    config_name: 'op_project',
    config_type: seed.configType,
    script: seed.script,
    target_file: seed.target,
    user_options: {
      op: 'op_project',
      ...seed.userOptions,
    },
    project_id: 1,
    op: 'op_project',
  };
}

/**
 * Seed configs.json rows for an open case — the full per-type row set the
 * importer consumes (settings seeding + cache hydration). Content mirrors the
 * committed open etalons byte-for-byte (same ids, key order, script families):
 *   - cann / torch_library: `bash <dir>\build.sh` (+ `python ../run.py` targets)
 *   - ascend / standard_custom: `--pkg --soc={soc_version} ...` chain
 *   - pyasc / triton: `python3 ./op_project.py` (triton adds the TRITON npu debug line)
 */
export function seedConfigRows(openCase: OpenCase, projectDir: string): Record<string, unknown>[] {
  const p = projectDir;
  const py = 'python3 ./op_project.py';
  const bash = (suffix: string): string => `bash ${p}\\build.sh${suffix}`;
  const pkg = `bash ${p}\\build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`;
  const pyFamily = openCase.id === 'pyasc' || openCase.id === 'triton';
  const pkgFamily = openCase.id === 'ascend' || openCase.id === 'standard_custom';
  const torch = openCase.id === 'torch_library';

  let buildOp: ConfigRowSeed;

  if (pyFamily) {
    buildOp = {
      id: 1,
      configType: 'build_op',
      script: py,
      target: py,
      userOptions: {
        script: py,
        config_name: 'op_project',
        target_file: py,
        cpu_debug_script: py,
        npu_debug_script: openCase.id === 'triton' ? TRITON_NPU_DEBUG : py,
      },
    };
  }
  else if (pkgFamily) {
    buildOp = {
      id: 1,
      configType: 'build_op',
      script: pkg,
      target: `${p}\\build_out\\*.run`,
      userOptions: {
        script: pkg,
        config_name: 'op_project',
        target_file: `${p}\\build_out\\*.run`,
        cpu_debug_script: `${pkg} --cpudebug --simulator {simulator_type}`,
        npu_debug_script: `${pkg} --debug`,
      },
    };
  }
  else {
    buildOp = {
      id: 1,
      configType: 'build_op',
      script: bash(''),
      target: torch ? 'python ../run.py' : `${p}\\build\\op_project`,
      userOptions: {
        script: bash(''),
        config_name: 'op_project',
        target_file: torch ? 'python ../run.py' : `${p}\\build\\op_project`,
        cpu_debug_script: bash(' --cpudebug'),
        npu_debug_script: bash(' --debug'),
      },
    };
  }

  const exampleScript = pyFamily ? py : pkgFamily ? bash(' --vendor_name=custom --run_example') : bash('');
  const exampleTarget = pyFamily ? py : pkgFamily ? `${p}\\build\\test_aclnn_op_project` : `${p}\\build\\op_project`;
  const utScript = pyFamily ? py : pkgFamily ? `bash ${p}\\build.sh --soc={soc_version} --ops={operatorNames} -u` : bash(' -u');
  const utTarget = pyFamily ? py : pkgFamily ? `${p}\\build\\test_aclnn_op_project` : `${p}\\build\\op_project`;
  const sanitizerScript = pyFamily ? py : pkgFamily ? `${pkg} --mssanitizer` : bash(' --mssanitizer');
  const sanitizerTarget = pyFamily ? py : pkgFamily ? `${p}\\build_out\\*.run` : torch ? 'python ../run.py' : `${p}\\build\\op_project`;
  const onBoardScript = pyFamily ? py : pkgFamily ? `${pkg} --onboard` : bash(' --onboard');
  const simulateScript = pyFamily ? py : pkgFamily ? `${pkg} --simulator {simulator_type}` : bash(' --simulator');

  return [
    // buildOp must go through toConfigRow like every other row: the store rows
    // are snake_case, and the open flow's getConfig filter matches
    // `config_type === 'build_op'` — a camelCase row would be treated as missing
    // and a duplicate snake_case row would be appended (lastId bump).
    toConfigRow(buildOp),
    toConfigRow({
      id: 2,
      configType: 'build_example',
      script: exampleScript,
      target: exampleTarget,
      userOptions: {
        script: exampleScript,
        config_name: 'op_project',
        target_file: exampleTarget,
        execution_mode: 'eager',
      },
    }),
    toConfigRow({
      id: 3,
      configType: 'ut_test',
      script: utScript,
      target: utTarget,
      userOptions: {
        script: utScript,
        config_name: 'op_project',
        target_file: utTarget,
      },
    }),
    toConfigRow({
      id: 4,
      configType: 'sanitizer',
      script: sanitizerScript,
      target: sanitizerTarget,
      userOptions: {
        script: sanitizerScript,
        target_file: sanitizerTarget,
        config_name: 'op_project',
        ...SANITIZER_OPTIONS,
      },
    }),
    toConfigRow({
      id: 5,
      configType: 'on_board',
      script: onBoardScript,
      target: null,
      userOptions: {
        script: onBoardScript,
        config_name: 'op_project',
        ...ON_BOARD_METRICS,
      },
    }),
    toConfigRow({
      id: 6,
      configType: 'simulate',
      script: simulateScript,
      target: null,
      userOptions: {
        script: simulateScript,
        config_name: 'op_project',
        ...SIMULATE_OPTIONS,
      },
    }),
  ];
}
