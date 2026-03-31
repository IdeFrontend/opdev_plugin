import child_process from 'child_process';

const ascend_soc_map: Record<string, string> = {
  '910C': 'ascend910_93',
  '910c': 'ascend910_93',
  '910B': 'ascend910b',
  '910b': 'ascend910b',
  '310P': 'ascend310p',
  '310p': 'ascend310p',
  '910A': 'ascend910',
  '910a': 'ascend910',
};

function getDefaultAscendEnvScript(): string {
  return '';
}

function getEnvFromScript(ascendEnvScript?: string): NodeJS.ProcessEnv {
  if (!ascendEnvScript) {
    return process.env;
  }

  try {
    const cmd = `source ${ascendEnvScript} && env`;
    const out = child_process.execSync(cmd, {
      shell: '/bin/bash',
      encoding: 'utf8',
    });
    const env: NodeJS.ProcessEnv = { ...process.env };

    for (const line of out.split('\n')) {
      if (!line) {
        continue;
      }

      const idx = line.indexOf('=');

      if (idx > 0) {
        const key = line.slice(0, idx);
        const val = line.slice(idx + 1);

        env[key] = val;
      }
    }

    return env;
  }
  catch (e: unknown) {
    console.error(`getEnvFromScript failed: ${e}`);

    return process.env;
  }
}

function getSocFromCoreName(coreName?: string) {
  if (!coreName) {
    return 'ascend910b';
  }

  for (const [
    k,
    v,
  ] of Object.entries(ascend_soc_map)) {
    if (coreName.includes(k)) {
      return v;
    }
  }

  return 'ascend910b';
}

export const ascend_env_script: string =
  process.env.ASCEND_ENV_SCRIPT || getDefaultAscendEnvScript();

export let soc_version: string = process.env.SOC_VERSION || 'ascend910b';

function refreshAscendEnv() {
  try {
    // populate environment vars from script
    const env = getEnvFromScript(ascend_env_script);

    // merge into process.env if desired (non-destructive)
    Object.assign(process.env, env);
  }
  catch (e: unknown) {
    console.error(e);
  }
}

function refreshSocVersion() {
  try {
    // Set UTF-8 encoding using chcp 65001 on Windows to avoid garbled characters
    const isWindows = process.platform === 'win32';
    let out: string;

    if (isWindows) {
      // First set UTF-8 encoding on Windows, and then execute the command
      try {
        out = child_process.execSync('chcp 65001 >nul && npu-smi info', {
          encoding: 'utf8',
          shell: 'cmd.exe',
        });
      }
      catch (e) {
        // If the above method fails, try to execute it directly
        out = child_process.execSync('npu-smi info', { encoding: 'utf8' });
      }
    }
    else {
      out = child_process.execSync('npu-smi info', { encoding: 'utf8' });
    }

    const lines = out.split('\n');
    const names: Array<[string, string]> = [];
    const re = /^\|\s*(\d+)\s+(\w+)\s+\|/;

    for (const line of lines) {
      const m = re.exec(line);

      if (m) {
        names.push([
          m[1],
          m[2],
        ]);
      }
    }

    if (names.length > 0) {
      soc_version = getSocFromCoreName(names[0][1]);
      console.info(`soc_version: ${soc_version}`);

      return names[0];
    }

    throw new Error('soc_version does not match in npu-smi info');
  }
  catch (e: unknown) {
    if ((e as { code?: string }).code === 'ENOENT') {
      console.error('npu-smi command not found; ensure Ascend driver is installed and environment variables are set correctly');
    }
    else if ((e as { status?: number }).status !== undefined) {
      console.error(`npu-smi command failed, error code: ${(e as { status: number }).status}`);

      if ((e as { stderr?: string }).stderr) {
        console.error(`stderr: ${(e as { stderr: string }).stderr}`);
      }
    }
    else {
      console.error(`Error while using npu-smi command: ${e}`);
    }

    return null;
  }
}

// Try refreshing at module load if env indicates
try {
  refreshAscendEnv();

  if (!process.env.SOC_VERSION) {
    refreshSocVersion();
  }
}
catch {
  // ignore
}
