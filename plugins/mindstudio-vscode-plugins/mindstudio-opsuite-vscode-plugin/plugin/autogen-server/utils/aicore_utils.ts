export function parse_cmd_options(optionsStr: string | null): Record<string, string> | null {
  if (!optionsStr) return null;
  const res: Record<string, string> = {};
  const parts = optionsStr.split(/\s+/).map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(?:--)?([a-zA-Z0-9_\-]+)=(.*)$/);
    if (m) {
      res[m[1]] = m[2];
    }
  }
  return res;
}
