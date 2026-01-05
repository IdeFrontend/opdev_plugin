import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface Op {
  op_path: string;
  op_type: string;
  op_name: string;
}

function getDetailedSystemInfo(): { osName: string; architecture: string } {
  const platformName = os.platform().toLowerCase();
  const arch = os.arch().toLowerCase();

  const archMap: Record<string, string> = {
    x64: 'x86_64',
    amd64: 'x86_64',
    aarch64: 'aarch64',
    arm64: 'aarch64',
    ia32: 'x86',
  };

  const architecture = archMap[arch] ?? arch;

  let osName = platformName;

  if (platformName === 'linux') {
    try {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      const idLine = content.split('\n').find((l) => l.startsWith('ID='));

      if (idLine) {
        osName = idLine.split('=')[1].replace(/"/g, '').trim();
      }
    } catch {
      // ignore and fall back to platformName
    }
  } else if (platformName === 'win32') {
    osName = 'windows';
  } else if (platformName === 'darwin') {
    osName = 'darwin';
  }

  return { osName, architecture };
}

export function getOpRunPath(op: Op): string {
  const opPath = op.op_path;

  if (op.op_type === 'ascend') {
    return path.resolve(opPath, '..', '..');
  }

  return opPath;
}

function getDefaultTarget(opRunPath: string, op: Op) {
  const { osName, architecture } = getDetailedSystemInfo();
  const targetDir = path.join(opRunPath, 'build_out');

  let targetOpFile: string;
  let targetExampleFile: string;

  if (op.op_type === 'ascend') {
    targetOpFile = path.join(
      opRunPath,
      'build_out',
      `cann-ops-math-custom_linux-${architecture}.run`,
    );
    targetExampleFile = path.join(
      opRunPath,
      'build',
      `test_aclnn_${op.op_name}`,
    );
  } else {
    targetOpFile = path.join(opRunPath, 'build', op.op_name);
    targetExampleFile = targetOpFile;
  }

  return { targetDir, targetOpFile, targetExampleFile, osName };
}

function getBuildScriptPath(opRunPath: string): string {
  return path.join(opRunPath, 'build.sh');
}

export function getDefaultPath(op: Op) {
  const opRunPath = getOpRunPath(op);
  const { targetDir, targetOpFile, targetExampleFile } = getDefaultTarget(
    opRunPath,
    op,
  );
  const opScriptPath = getBuildScriptPath(opRunPath);
  const exampleScriptPath = opScriptPath;

  return {
    opScriptPath: opScriptPath,
    exampleScriptPath: exampleScriptPath,
    targetDir: path.resolve(targetDir),
    targetOpFile: path.resolve(targetOpFile),
    targetExampleFile: path.resolve(targetExampleFile),
  };
}
