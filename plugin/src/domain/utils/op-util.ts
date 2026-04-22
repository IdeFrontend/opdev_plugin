import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigRecord } from '../models/config-model';
import { OperatorPluginRegistry } from '../plugins/operator-plugin.registry';

interface Op {
  op_path: string;
  op_type: string;
  op_name: string;
}

export function getDetailedSystemInfo(): {
  osName: string;
  architecture: string
} {
  const platformName = os.platform()
    .toLowerCase();
  const arch = os.arch()
    .toLowerCase();

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
      const idLine = content.split('\n')
        .find((l) => l.startsWith('ID='));

      if (idLine) {
        osName = idLine.split('=')[1].replace(/"/g, '')
          .trim();
      }
    }
    catch {
      // ignore and fall back to platformName
    }
  }
  else if (platformName === 'win32') {
    osName = 'windows';
  }
  else if (platformName === 'darwin') {
    osName = 'darwin';
  }

  return {
    osName,
    architecture,
  };
}

export function getOpRunPath(op: Op, _config?: ConfigRecord): string {
  return op.op_path;
}

export function getDefaultPath(op: Op) {
  return OperatorPluginRegistry.getDefaultPaths(op);
}
