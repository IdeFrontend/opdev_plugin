const ASCEND_EXPORT_KEYS = [
  'SOC_VERSION',
  'NPU_ARCH',
] as const;

const SOURCE_PREFIX_RE = /^\.\s+[^&]+\s+&&\s+/;

export function shellQuoteBash(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatAscendEnvExports(env: Record<string, string>): string {
  const parts: string[] = [];

  for (const key of ASCEND_EXPORT_KEYS) {
    const value = env[key];

    if (value === undefined || value.trim() === '') {
      continue;
    }

    parts.push(`export ${key}=${shellQuoteBash(value)}`);
  }

  return parts.join(' && ');
}

export function injectAscendEnvExports(command: string, env: Record<string, string>): string {
  const exports = formatAscendEnvExports(env);

  if (!exports) {
    return command;
  }

  const match = command.match(SOURCE_PREFIX_RE);

  if (match) {
    const prefix = match[0];
    const rest = command.slice(prefix.length);

    return `${exports} && ${prefix}${rest}`;
  }

  return `${exports} && ${command}`;
}
