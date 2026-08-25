/**
 * Golden-baseline fixtures: one realistic store set per project type.
 *
 * Shapes replicate what generateStructure / completeProjectConfigs / the import
 * bridge produce on disk today:
 * - projects.json { lastId, projects[] } (project-model.ts)
 * - configs.json  { lastId, configs[]  } (config-model.ts ConfigRecord)
 * - ops.json      { lastId, ops[]      } (model.ts OpRecord)
 * - settings.json full dotted `op-devtools.*` keys (bridge output, config-service.ts:910-969)
 *
 * All paths are POSIX strings so command strings are deterministic on every platform.
 */

export const FIXTURE_TYPES = [
  'cann',
  'ascend',
  'pyasc',
  'triton',
  'torch_library',
  'standard_custom',
] as const;

export type FixtureType = (typeof FIXTURE_TYPES)[number];

export interface FixtureMeta {
  /** project row id (always 1 in fixtures) */
  projectId: number;
  /** workspace project path (projectPath of the section base-context resolvers) */
  projectPath: string;
  /** op of the fixture's primary (build_op) config row (op of the section base-context resolvers) */
  opName: string;
  buildOpConfigId: number;
  buildExampleConfigId: number;
  utTestConfigId: number;
  sanitizerConfigId: number;
  onBoardConfigId: number;
  simulateConfigId: number;
  /** comma-separated operator names for standard-custom splices */
  operatorNames?: string;
  compileOption?: string;
}

export interface FixtureState {
  projects: unknown[];
  configs: unknown[];
  ops: unknown[];
  settings: Record<string, unknown>;
  meta: FixtureMeta;
}

function projectRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    project_name: 'op_project',
    project_path: '/workspace/projects/op_project',
    template_name: null,
    project_type: 'cann',
    ascend_env_script: '/etc/profile',
    soc_version: null,
    ops_meet: null,
    ops_list: null,
    experimental_ops_list: null,
    selected_operator_ids: null,
    ...overrides,
  };
}

function opRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    project_id: 1,
    op_name: 'op_name',
    op_type: 'cann',
    op_path: '/workspace/projects/op_project',
    template_name: null,
    ...overrides,
  };
}

function configRecord(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    config_name: 'op_name',
    config_type: 'build_op',
    script: '',
    target_file: null,
    user_options: null,
    project_id: 1,
    op: 'op_name',
    ...overrides,
  };
}

interface BuildableFixture {
  name: string;
  opName: string;
  opType: string;
  projectType: string;
  templateName: string | null;
  /** script strings per config type (already seeded values, placeholders intact) */
  scripts: Record<string, string>;
  targetOpFile: string;
  targetExampleFile: string;
  /** extra build_op user_options (cpu/npu debug scripts) */
  debugScripts?: Record<string, string>;
}

const ON_BOARD_METRICS: Record<string, unknown> = {
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
};

const SANITIZER_OPTIONS: Record<string, unknown> = {
  tool: {
    memcheck: true,
    racecheck: true,
    initcheck: true,
  },
  memcheckOption: {
    'leak-check': true,
    'check-unused-memory': true,
  },
  logLevel: 'warn',
  maxDebuglogSize: 1024,
  useBlock: false,
  blockId: null,
  fileMapList: [],
};

function buildFixture(f: BuildableFixture): FixtureState {
  const p = `/workspace/projects/${f.name}`;
  const opPath = p;

  // The torch_library_template seeder rule — build_op AND sanitizer
  // targets become 'python ../run.py' instead of the generic `build/<op>`
  // (config-service.ts:578-580, welcome-controller.ts:376-383). The fixture
  // materializes the settings by the SAME rule the seeder applies — no ad-hoc
  // override injection.
  const torchRunPyTarget = f.templateName === 'torch_library_template'
    ? 'python ../run.py'
    : undefined;

  const buildOpTarget = torchRunPyTarget ?? f.targetOpFile;
  const sanitizerTarget = torchRunPyTarget ?? f.targetOpFile;

  const project = projectRecord({
    project_name: f.name,
    project_path: p,
    template_name: f.templateName,
    project_type: f.projectType,
  });

  const op = opRecord({
    op_name: f.opName,
    op_type: f.opType,
    op_path: opPath,
    template_name: f.templateName,
  });

  const buildOpUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.build_op,
    config_name: f.opName,
    target_file: buildOpTarget,
    ...(f.debugScripts || {}),
  };

  const buildExampleUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.build_example,
    config_name: f.opName,
    target_file: f.targetExampleFile,
    execution_mode: 'eager',
  };

  const utTestUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.ut_test,
    config_name: f.opName,
    target_file: f.targetExampleFile,
  };

  const sanitizerUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.sanitizer,
    target_file: sanitizerTarget,
    config_name: f.opName,
    ...SANITIZER_OPTIONS,
  };

  const onBoardUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.on_board,
    config_name: f.opName,
    ...ON_BOARD_METRICS,
    fileMapList: [],
  };

  const simulateUo: Record<string, unknown> = {
    op: f.opName,
    script: f.scripts.simulate,
    config_name: f.opName,
    PMSampling: false,
    ResourceConflictRatio: true,
    fileMapList: [],
  };

  const configs = [
    configRecord({
      id: 1,
      config_name: f.opName,
      config_type: 'build_op',
      script: f.scripts.build_op,
      target_file: buildOpTarget,
      user_options: buildOpUo,
      op: f.opName,
    }),
    configRecord({
      id: 2,
      config_name: f.opName,
      config_type: 'build_example',
      script: f.scripts.build_example,
      target_file: f.targetExampleFile,
      user_options: buildExampleUo,
      op: f.opName,
    }),
    configRecord({
      id: 3,
      config_name: f.opName,
      config_type: 'ut_test',
      script: f.scripts.ut_test,
      target_file: f.targetExampleFile,
      user_options: utTestUo,
      op: f.opName,
    }),
    configRecord({
      id: 4,
      config_name: f.opName,
      config_type: 'sanitizer',
      script: f.scripts.sanitizer,
      target_file: sanitizerTarget,
      user_options: sanitizerUo,
      op: f.opName,
    }),
    configRecord({
      id: 5,
      config_name: f.opName,
      config_type: 'on_board',
      script: f.scripts.on_board,
      user_options: onBoardUo,
      op: f.opName,
    }),
    configRecord({
      id: 6,
      config_name: f.opName,
      config_type: 'simulate',
      script: f.scripts.simulate,
      user_options: simulateUo,
      op: f.opName,
    }),
  ];

  const settings: Record<string, unknown> = {
    'op-devtools.debugMode': true,
    'op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile': f.opName,
    'op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand': buildOpTarget,
    'op-devtools.compileAndDeploy.buildConfig.compileCommand': f.scripts.build_op,
    'op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand': f.scripts.cpu_debug,
    'op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand': f.scripts.npu_debug,
    'op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand': f.scripts.on_board,
    'op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand': f.scripts.simulate,
    'op-devtools.compileAndDeploy.buildConfig.utTestCompileCommand': f.scripts.ut_test,
    'op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand': f.scripts.sanitizer,
    'op-devtools.compileAndDeploy.exampleBuildConfig.executionMode': 'eager',
    'op-devtools.compileAndDeploy.exampleBuildConfig.runCommand': f.scripts.build_example,
    'op-devtools.sanitizer.showQuickOptions': true,
    'op-devtools.sanitizer.memory': true,
    'op-devtools.sanitizer.race': true,
    'op-devtools.sanitizer.uninitialized': true,
    'op-devtools.sanitizer.memoryLeak': true,
    'op-devtools.sanitizer.allocUnused': true,
    'op-devtools.sanitizer.reportLogLevel': 'warn',
    'op-devtools.sanitizer.maxSingleLogFileSize': 1024,
    'op-devtools.sanitizer.detectionScope': 'global',
    'op-devtools.sanitizer.blockId': null,
    'op-devtools.performanceTuning.simulation.showQuickOptions': true,
    'op-devtools.performanceTuning.simulation.memoryThroughputWaveform': false,
    'op-devtools.performanceTuning.simulation.resourceConflictRatio': true,
    'op-devtools.performanceTuning.onBoard.showQuickOptions': true,
    'op-devtools.performanceTuning.onBoard.interCoreLoad': true,
    'op-devtools.performanceTuning.onBoard.roofline': true,
    'op-devtools.performanceTuning.onBoard.operatorCodeHotspot': true,
    'op-devtools.performanceTuning.onBoard.cacheHeatmap': true,
    'op-devtools.performanceTuning.onBoard.pcSampling': false,
    'op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio': true,
    'op-devtools.performanceTuning.onBoard.l2CacheHitRate': true,
    'op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio': true,
    'op-devtools.performanceTuning.onBoard.resourceConflictRatio': true,
    'op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling': false,
    'op-devtools.performanceTuning.onBoard.operatorMetrics': true,
    'op-devtools.environment.environmentScript': '/etc/profile',
    'op-devtools.environment.socVersion': 'ascend910b',
  };

  return {
    projects: [project],
    configs,
    ops: [op],
    settings,
    meta: {
      projectId: 1,
      projectPath: p,
      opName: f.opName,
      buildOpConfigId: 1,
      buildExampleConfigId: 2,
      utTestConfigId: 3,
      sanitizerConfigId: 4,
      onBoardConfigId: 5,
      simulateConfigId: 6,
    },
  };
}

const CANN_OP = '/workspace/projects/cann_hello';
const ASCEND_OP = '/workspace/projects/ascend_add_custom';
const PYASC_OP = '/workspace/projects/pyasc_demo';
const TRITON_OP = '/workspace/projects/triton_vector_add';
const TORCH_OP = '/workspace/projects/torch_lib';

const CANN_BASE = `bash ${CANN_OP}/build.sh`;

const ASCEND_BASE = `bash ${ASCEND_OP}/build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`;

export const fixtures: Record<FixtureType, FixtureState> = {
  // AbstractOperatorPlugin defaults (cann/hello_world)
  cann: buildFixture({
    name: 'cann_hello',
    opName: 'cann_hello',
    opType: 'cann',
    projectType: 'cann',
    templateName: 'hello_world',
    scripts: {
      build_op: `${CANN_BASE}`,
      build_example: `${CANN_BASE}`,
      ut_test: `${CANN_BASE} -u`,
      sanitizer: `${CANN_BASE} --mssanitizer`,
      on_board: `${CANN_BASE} --onboard`,
      simulate: `${CANN_BASE} --simulator`,
      cpu_debug: `${CANN_BASE} --cpudebug`,
      npu_debug: `${CANN_BASE} --debug`,
    },
    targetOpFile: `${CANN_OP}/build/cann_hello`,
    targetExampleFile: `${CANN_OP}/build/cann_hello`,
    debugScripts: {
      cpu_debug_script: `${CANN_BASE} --cpudebug`,
      npu_debug_script: `${CANN_BASE} --debug`,
    },
  }),

  // AscendPlugin (Ascend C, add_custom template; bisheng check absent → plain flags)
  ascend: buildFixture({
    name: 'ascend_add_custom',
    opName: 'add_custom',
    opType: 'ascend',
    projectType: 'ascend',
    templateName: 'add_custom',
    scripts: {
      build_op: ASCEND_BASE,
      build_example: `bash ${ASCEND_OP}/build.sh --vendor_name=custom --run_example`,
      ut_test: `bash ${ASCEND_OP}/build.sh --soc={soc_version} --ops={operatorNames} -u`,
      sanitizer: `${ASCEND_BASE} --mssanitizer`,
      on_board: `${ASCEND_BASE} --onboard`,
      simulate: `${ASCEND_BASE} --simulator {simulator_type}`,
      cpu_debug: `${ASCEND_BASE} --cpudebug --simulator {simulator_type}`,
      npu_debug: `${ASCEND_BASE} --debug`,
    },
    targetOpFile: `${ASCEND_OP}/build_out/*.run`,
    targetExampleFile: `${ASCEND_OP}/build/test_aclnn_add_custom`,
    debugScripts: {
      cpu_debug_script: `${ASCEND_BASE} --cpudebug --simulator {simulator_type}`,
      npu_debug_script: `${ASCEND_BASE} --debug`,
    },
  }),

  // PyAscPlugin — single .py entry everywhere
  pyasc: buildFixture({
    name: 'pyasc_demo',
    opName: 'pyasc_demo',
    opType: 'pyasc',
    projectType: 'pyasc',
    templateName: 'pyasc_template',
    scripts: {
      build_op: 'python3 ./pyasc_demo.py',
      build_example: 'python3 ./pyasc_demo.py',
      ut_test: 'python3 ./pyasc_demo.py',
      sanitizer: 'python3 ./pyasc_demo.py',
      on_board: 'python3 ./pyasc_demo.py',
      simulate: 'python3 ./pyasc_demo.py',
      cpu_debug: 'python3 ./pyasc_demo.py',
      npu_debug: 'python3 ./pyasc_demo.py',
    },
    targetOpFile: 'python3 ./pyasc_demo.py',
    targetExampleFile: 'python3 ./pyasc_demo.py',
  }),

  // TritonPlugin — python entry; npu debug via debug entry + kernel sidecar writer
  triton: buildFixture({
    name: 'triton_vector_add',
    opName: 'triton_vector_add',
    opType: 'triton',
    projectType: 'triton',
    templateName: 'triton_vector_add',
    scripts: {
      build_op: 'python3 ./triton_vector_add.py',
      build_example: 'python3 ./triton_vector_add.py',
      ut_test: 'python3 ./triton_vector_add.py',
      sanitizer: 'python3 ./triton_vector_add.py',
      on_board: 'python3 ./triton_vector_add.py',
      simulate: 'python3 ./triton_vector_add.py',
      cpu_debug: 'python3 ./triton_vector_add.py',
      npu_debug: 'TRITON_DISABLE_CACHE=1 TRITON_DISABLE_LINE_INFO=false LLVM_EXTRACT_DI_LOCAL_VARIABLES=1 python3 ./triton_vector_add.py && sh -c \'K=$(find "$HOME/.triton/cache" -type f -name \'triton_vector_add.npubin\' -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); [ -z "$K" ] && K=$(find "$HOME/.triton/cache" -type f \\( -name \'*.npubin\' -o -name kernel.o -o -name kernel_reloc.o \\) -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); [ -z "$K" ] && exit 0; d="$PWD"; while [ "$d" != "/" ]; do for cfg in .vscode .arts; do if [ -d "$d/$cfg" ]; then printf "%s\\n" "$K" > "$d/$cfg/.triton_launch_kernel_path"; exit 0; fi; done; d=$(dirname "$d"); done\'',
    },
    targetOpFile: 'python3 ./triton_vector_add.py',
    targetExampleFile: 'python3 ./triton_vector_add.py',
  }),

  // torch_library_template special case: build_op/sanitizer target = 'python ../run.py'
  torch_library: buildFixture({
    name: 'torch_lib',
    opName: 'torch_lib',
    opType: 'cann',
    projectType: 'cann',
    templateName: 'torch_library_template',
    scripts: {
      build_op: `bash ${TORCH_OP}/build.sh`,
      build_example: `bash ${TORCH_OP}/build.sh`,
      ut_test: `bash ${TORCH_OP}/build.sh -u`,
      sanitizer: `bash ${TORCH_OP}/build.sh --mssanitizer`,
      on_board: `bash ${TORCH_OP}/build.sh --onboard`,
      simulate: `bash ${TORCH_OP}/build.sh --simulator`,
      cpu_debug: `bash ${TORCH_OP}/build.sh --cpudebug`,
      npu_debug: `bash ${TORCH_OP}/build.sh --debug`,
    },
    targetOpFile: `${TORCH_OP}/build/torch_lib`,
    targetExampleFile: `${TORCH_OP}/build/torch_lib`,
    debugScripts: {
      cpu_debug_script: `bash ${TORCH_OP}/build.sh --cpudebug`,
      npu_debug_script: `bash ${TORCH_OP}/build.sh --debug`,
    },
  }),
};

function standardCustomRootOp(): Record<string, unknown> {
  // The real base shape: ONE root row for the whole collection (getConfigSeedOps
  // root synthesis) — per-operator entries live only in the scan list.
  return opRecord({
    id: 1,
    op_name: 'ops_math',
    op_type: 'ascend',
    op_path: '/workspace/projects/ops_math',
    template_name: null,
  });
}

function standardCustomConfigs(): Record<string, unknown>[] {
  // The real base shape: ONE config set keyed by the ROOT (op = the project
  // name), scripts against the root build.sh, targets under the root build_out —
  // the concrete operators are selected only via the --ops={operatorNames}
  // placeholder.
  const root = '/workspace/projects/ops_math';
  const name = 'ops_math';
  const base = `bash ${root}/build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`;

  const uo = (script: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    op: name,
    script,
    config_name: name,
    ...extra,
  });

  return [
    configRecord({
      id: 1,
      config_name: name,
      config_type: 'build_op',
      script: base,
      target_file: `${root}/build_out/*.run`,
      user_options: uo(base, { target_file: `${root}/build_out/*.run` }),
      op: name,
    }),
    configRecord({
      id: 2,
      config_name: name,
      config_type: 'build_example',
      script: `bash ${root}/build.sh --vendor_name=custom --run_example`,
      target_file: `${root}/build/test_aclnn_${name}`,
      user_options: uo(`bash ${root}/build.sh --vendor_name=custom --run_example`, {
        target_file: `${root}/build/test_aclnn_${name}`,
        execution_mode: 'eager',
      }),
      op: name,
    }),
    configRecord({
      id: 3,
      config_name: name,
      config_type: 'ut_test',
      script: `bash ${root}/build.sh --soc={soc_version} --ops={operatorNames} -u`,
      target_file: `${root}/build/test_aclnn_${name}`,
      user_options: uo(`bash ${root}/build.sh --soc={soc_version} --ops={operatorNames} -u`, { target_file: `${root}/build/test_aclnn_${name}` }),
      op: name,
    }),
    configRecord({
      id: 4,
      config_name: name,
      config_type: 'sanitizer',
      script: `${base} --mssanitizer`,
      target_file: `${root}/build_out/*.run`,
      user_options: uo(`${base} --mssanitizer`, {
        target_file: `${root}/build_out/*.run`,
        ...SANITIZER_OPTIONS,
      }),
      op: name,
    }),
    configRecord({
      id: 5,
      config_name: name,
      config_type: 'on_board',
      script: `${base} --onboard`,
      user_options: uo(`${base} --onboard`, {
        ...ON_BOARD_METRICS,
        fileMapList: [],
      }),
      op: name,
    }),
    configRecord({
      id: 6,
      config_name: name,
      config_type: 'simulate',
      script: `${base} --simulator {simulator_type}`,
      user_options: uo(`${base} --simulator {simulator_type}`, {
        PMSampling: false,
        ResourceConflictRatio: true,
        fileMapList: [],
      }),
      op: name,
    }),
  ];
}

const opsMathProject = projectRecord({
  project_name: 'ops-math',
  project_path: '/workspace/projects/ops_math',
  template_name: 'add_custom',
  project_type: 'ascend',
  ops_meet: [
    {
      name: 'math',
      path: '/workspace/projects/ops_math/math',
    },
  ],
  ops_list: [
    {
      name: 'add',
      path: '/workspace/projects/ops_math/math/add',
      isCompiled: true,
    },
    {
      name: 'sub',
      path: '/workspace/projects/ops_math/math/sub',
      isCompiled: false,
    },
  ],
  selected_operator_ids: [10001],
});

const opsMathSettings = ((): Record<string, unknown> => {
  const root = '/workspace/projects/ops_math';
  const base = `bash ${root}/build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`;

  return {
    'op-devtools.debugMode': true,
    'op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile': 'ops_math',
    'op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand': `${root}/build_out/*.run`,
    'op-devtools.compileAndDeploy.buildConfig.compileCommand': base,
    'op-devtools.compileAndDeploy.buildConfig.cpuDebugCompileCommand': `${base} --cpudebug --simulator {simulator_type}`,
    'op-devtools.compileAndDeploy.buildConfig.npuDebugCompileCommand': `${base} --debug`,
    'op-devtools.compileAndDeploy.buildConfig.onBoardCompileCommand': `${base} --onboard`,
    'op-devtools.compileAndDeploy.buildConfig.simulationCompileCommand': `${base} --simulator {simulator_type}`,
    'op-devtools.compileAndDeploy.buildConfig.utTestCompileCommand': `bash ${root}/build.sh --soc={soc_version} --ops={operatorNames} -u`,
    'op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand': `${base} --mssanitizer`,
    'op-devtools.compileAndDeploy.exampleBuildConfig.executionMode': 'eager',
    'op-devtools.compileAndDeploy.exampleBuildConfig.runCommand': `bash ${root}/build.sh --vendor_name=custom --run_example`,
    'op-devtools.compileAndDeploy.exampleBuildConfig.targetFile': `${root}/build/test_aclnn_ops_math`,
    'op-devtools.sanitizer.showQuickOptions': true,
    'op-devtools.sanitizer.memory': true,
    'op-devtools.sanitizer.race': true,
    'op-devtools.sanitizer.uninitialized': true,
    'op-devtools.sanitizer.memoryLeak': true,
    'op-devtools.sanitizer.allocUnused': true,
    'op-devtools.sanitizer.reportLogLevel': 'warn',
    'op-devtools.sanitizer.maxSingleLogFileSize': 1024,
    'op-devtools.sanitizer.detectionScope': 'global',
    'op-devtools.sanitizer.blockId': null,
    'op-devtools.performanceTuning.simulation.showQuickOptions': true,
    'op-devtools.performanceTuning.simulation.memoryThroughputWaveform': false,
    'op-devtools.performanceTuning.simulation.resourceConflictRatio': true,
    'op-devtools.performanceTuning.onBoard.showQuickOptions': true,
    'op-devtools.performanceTuning.onBoard.interCoreLoad': true,
    'op-devtools.performanceTuning.onBoard.roofline': true,
    'op-devtools.performanceTuning.onBoard.operatorCodeHotspot': true,
    'op-devtools.performanceTuning.onBoard.cacheHeatmap': true,
    'op-devtools.performanceTuning.onBoard.pcSampling': false,
    'op-devtools.performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio': true,
    'op-devtools.performanceTuning.onBoard.l2CacheHitRate': true,
    'op-devtools.performanceTuning.onBoard.memoryReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.l0ReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.ubReadWriteBandwidth': true,
    'op-devtools.performanceTuning.onBoard.computeAndMoveUnitTimeRatio': true,
    'op-devtools.performanceTuning.onBoard.resourceConflictRatio': true,
    'op-devtools.performanceTuning.onBoard.enableKernelCodeSegmentProfiling': false,
    'op-devtools.performanceTuning.onBoard.operatorMetrics': true,
    'op-devtools.environment.environmentScript': '/etc/profile',
    'op-devtools.environment.socVersion': 'ascend910b',
  };
})();

fixtures.standard_custom = {
  projects: [opsMathProject],
  configs: standardCustomConfigs(),
  ops: [standardCustomRootOp()],
  settings: opsMathSettings,
  meta: {
    projectId: 1,
    projectPath: '/workspace/projects/ops_math',
    opName: 'add',
    buildOpConfigId: 1,
    buildExampleConfigId: 2,
    utTestConfigId: 3,
    sanitizerConfigId: 4,
    onBoardConfigId: 5,
    simulateConfigId: 6,
    operatorNames: 'add,sub',
    compileOption: '--soc=ascend910b',
  },
};
