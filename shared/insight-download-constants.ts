export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export const REFERER = 'https://gitcode.net/';

export const WGET_DOWNLOAD_ARGS = [
  '-q',
  '-O',
  '{destPath}',
  `--user-agent=${USER_AGENT}`,
  `--referer=${REFERER}`,
  '--max-redirect=5',
  '{url}',
];

export const CURL_DOWNLOAD_ARGS = [
  '-sSL',
  '-o',
  '{destPath}',
  '-A',
  USER_AGENT,
  '-e',
  REFERER,
  '-L',
  '{url}',
];

export const WGET_DOWNLOAD_CMD_TEMPLATE = `wget -q -O "{destPath}" --user-agent="${USER_AGENT}" --referer="${REFERER}" --max-redirect=5 "{url}"`;

export const CURL_DOWNLOAD_CMD_TEMPLATE = `curl -sSL -o "{destPath}" -A "${USER_AGENT}" -e "${REFERER}" -L "{url}"`;

export function buildWgetArgs(destPath: string, url: string): string[] {
  return WGET_DOWNLOAD_ARGS.map((arg) =>
    arg.replace('{destPath}', destPath)
      .replace('{url}', url));
}

export function buildCurlArgs(destPath: string, url: string): string[] {
  return CURL_DOWNLOAD_ARGS.map((arg) =>
    arg.replace('{destPath}', destPath)
      .replace('{url}', url));
}

export function buildWgetCommand(destPath: string, url: string): string {
  return WGET_DOWNLOAD_CMD_TEMPLATE
    .replace('{destPath}', destPath)
    .replace('{url}', url);
}

export function buildCurlCommand(destPath: string, url: string): string {
  return CURL_DOWNLOAD_CMD_TEMPLATE
    .replace('{destPath}', destPath)
    .replace('{url}', url);
}
