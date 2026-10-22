/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
