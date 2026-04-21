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
export let emulator_type: string = process.env.EMULATOR_TYPE || 'Ascend910B3'; // 仿真器类型

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
  // 优先执行兜底方案
  try {
    console.info('尝试使用兜底方案获取SOC版本');
    // 找到第一个cann的set_env.sh脚本
    const findCmd = 'find / -path "*/cann*/set_env.sh" 2>/dev/null | head -1';
    const setEnvScript = child_process.execSync(findCmd, { encoding: 'utf8', shell: '/bin/bash' }).trim();
    
    if (setEnvScript) {
      console.info(`找到set_env.sh脚本: ${setEnvScript}`);
      // source脚本后执行asys info命令
      const asysCmd = `source ${setEnvScript} && asys info -r=status | grep "Ascend"`;
      const asysOutput = child_process.execSync(asysCmd, { encoding: 'utf8', shell: '/bin/bash' });
      
      console.info(`asys info输出: ${asysOutput}`);
      if (asysOutput) {
        emulator_type = `Ascend${(asysOutput.split('Ascend ')[1] || '').split(' ')[0] || ''}`;
        console.info(`emulator_type: ${emulator_type}`);
      }
      if (asysOutput.includes('Ascend 950PR_9589')) {
        soc_version = 'ascend950';
        console.info('通过兜底方案确定SOC版本为: ascend950');
      } else if (asysOutput.includes('Ascend 910B3')) {
        soc_version = 'ascend910b';
        console.info('通过兜底方案确定SOC版本为: ascend910b');
      }
      
      // 兜底方案成功找到soc_version后返回
      if (soc_version) {
        console.info(`soc_version: ${soc_version}`);
        return null;
      }
    } else {
      console.error('未找到cann的set_env.sh脚本');
    }
  } catch (fallbackError) {
    console.error(`执行兜底方案失败: ${fallbackError}`);
    // 兜底方案失败，尝试使用原来的npu-smi info命令
    console.info('兜底方案失败，尝试使用npu-smi info命令获取SOC版本');
  }

  // 兜底方案失败后，执行原来的npu-smi info命令
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

    // Execute fallback logic.
    try {
      console.info('Attempting to detect SOC version with fallback logic');
      // Find the first CANN set_env.sh script.
      const findCmd = 'find / -path "*/cann*/set_env.sh" 2>/dev/null | head -1';
      const setEnvScript = child_process.execSync(findCmd, { encoding: 'utf8', shell: '/bin/bash' }).trim();
      
      if (setEnvScript) {
        console.info(`Found set_env.sh script: ${setEnvScript}`);
        // Source the script, then run `asys info`.
        const asysCmd = `source ${setEnvScript} && asys info -r=status | grep "Ascend"`;
        const asysOutput = child_process.execSync(asysCmd, { encoding: 'utf8', shell: '/bin/bash' });
        
        console.info(`asys info output: ${asysOutput}`);
        
        if (asysOutput.includes('Ascend 950PR_9589')) {
          soc_version = 'ascend950';
          console.info('Fallback detected SOC version: ascend950');
        } else if (asysOutput.includes('Ascend 910B3')) {
          soc_version = 'ascend910b';
          console.info('Fallback detected SOC version: ascend910b');
        }
      } else {
        console.error('No CANN set_env.sh script was found');
      }
    } catch (fallbackError) {
      console.error(`Fallback execution failed: ${fallbackError}`);
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
