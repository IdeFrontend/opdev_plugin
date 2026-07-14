import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import { t } from 'i18next';
import AdmZip from 'adm-zip';

const execFileAsync = promisify(execFile);

import { EnvironmentVariableReader } from '../class/environment-variable-reader';
import {
  INSIGHT_VERSION_MAPPINGS,
  INSIGHT_VERSION_FILE_NAME,
  INSIGHT_BACKUP_SUFFIX,
} from '../constants';
import {
  buildWgetArgs,
  buildCurlArgs,
  buildWgetCommand,
  buildCurlCommand,
  USER_AGENT,
  REFERER,
} from '@shared';
import {
  type InsightVersionMapping,
  type InsightVersionJson,
  type InsightVersionHistory,
} from './insight-types';

interface DownloadAttempt {
  method: string;
  command: string;
  error: string;
}

export class InsightService {
  private static instance: InsightService;

  private constructor() { }

  static getInstance(): InsightService {
    if (!InsightService.instance) {
      InsightService.instance = new InsightService();
    }

    return InsightService.instance;
  }

  resolveInsightPath(context: vscode.ExtensionContext): string {
    const config = vscode.workspace.getConfiguration('op-devtools.environment');
    const configPath = config.get<string>('insightPath');

    if (configPath && configPath.trim()) {
      return configPath.trim();
    }

    return this.getAndSetDefaultInsightPath(context);
  }

  private getAndSetDefaultInsightPath(context: vscode.ExtensionContext): string {
    const envPath = EnvironmentVariableReader.getEnv('INSIGHT_HOME_PATH');

    let defaultPath: string;

    if (envPath && envPath.trim()) {
      defaultPath = envPath.trim();
    }
    else {
      const extensionDir = path.dirname(context.extensionPath);

      defaultPath = path.join(extensionDir, 'insight');
    }

    return defaultPath;
  }

  async initializeInsightPathConfig(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('op-devtools.environment');
    const configPath = config.get<string>('insightPath');

    if (configPath && configPath.trim()) {
      return;
    }

    const defaultPath = this.getAndSetDefaultInsightPath(context);

    try {
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        await config.update('insightPath', defaultPath, vscode.ConfigurationTarget.Workspace);
      }
      else {
        await config.update('insightPath', defaultPath, vscode.ConfigurationTarget.Global);
      }
    }
    catch (_) {
      // Ignore config update errors - fallback to default behavior
    }
  }

  getVersionFilePath(insightPath: string): string {
    return path.join(insightPath, INSIGHT_VERSION_FILE_NAME);
  }

  async readVersionFile(insightPath: string): Promise<InsightVersionJson | null> {
    const versionFilePath = this.getVersionFilePath(insightPath);

    if (!fs.existsSync(versionFilePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(versionFilePath, 'utf8');

      return JSON.parse(content) as InsightVersionJson;
    }
    catch {
      return null;
    }
  }

  async writeVersionFile(insightPath: string, versionJson: InsightVersionJson): Promise<void> {
    const versionFilePath = this.getVersionFilePath(insightPath);

    await fs.promises.writeFile(versionFilePath, JSON.stringify(versionJson, null, 2), 'utf8');
  }

  async updateVersionFile(
    insightPath: string,
    newVersion: string,
  ): Promise<void> {
    const existingVersion = await this.readVersionFile(insightPath);
    const now = new Date()
      .toISOString();

    const historyVersion: InsightVersionHistory[] = [];

    if (existingVersion) {
      historyVersion.push({
        version: existingVersion.version,
        createTime: existingVersion.createTime,
        updateTime: now,
      });

      if (existingVersion.historyVersion) {
        historyVersion.push(...existingVersion.historyVersion);
      }
    }

    const newVersionJson: InsightVersionJson = {
      version: newVersion,
      createTime: now,
      historyVersion,
    };

    await this.writeVersionFile(insightPath, newVersionJson);
  }

  async createDefaultVersionFile(insightPath: string): Promise<void> {
    const versionJson: InsightVersionJson = {
      version: '0.0.1',
      createTime: new Date()
        .toISOString(),
      historyVersion: [],
    };

    await this.writeVersionFile(insightPath, versionJson);
  }

  findMatchingInsightVersion(pluginVersion: string): InsightVersionMapping | undefined {
    const sortedMappings = [...INSIGHT_VERSION_MAPPINGS].sort((a, b) => {
      return this.compareVersions(b.minPluginVersion, a.minPluginVersion);
    });

    for (const mapping of sortedMappings) {
      if (this.compareVersions(pluginVersion, mapping.minPluginVersion) >= 0) {
        return mapping;
      }
    }

    return sortedMappings[sortedMappings.length - 1];
  }

  compareVersions(versionA: string, versionB: string): number {
    const partsA = versionA.split('.')
      .map((p) => parseInt(p, 10) || 0);
    const partsB = versionB.split('.')
      .map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const a = partsA[i] || 0;
      const b = partsB[i] || 0;

      if (a > b) {
        return 1;
      }

      if (a < b) {
        return -1;
      }
    }

    return 0;
  }

  getBackupPath(insightPath: string): string {
    const parentDir = path.dirname(insightPath);
    const baseName = path.basename(insightPath);

    return path.join(parentDir, `${baseName}${INSIGHT_BACKUP_SUFFIX}`);
  }

  async backupInsight(insightPath: string): Promise<void> {
    const backupPath = this.getBackupPath(insightPath);

    if (fs.existsSync(backupPath)) {
      await fs.promises.rm(backupPath, {
        recursive: true,
        force: true,
      });
    }

    await fs.promises.cp(insightPath, backupPath, { recursive: true });
  }

  async restoreInsight(insightPath: string): Promise<void> {
    const backupPath = this.getBackupPath(insightPath);

    if (!fs.existsSync(backupPath)) {
      return;
    }

    if (fs.existsSync(insightPath)) {
      await fs.promises.rm(insightPath, {
        recursive: true,
        force: true,
      });
    }

    await fs.promises.cp(backupPath, insightPath, { recursive: true });
    await fs.promises.rm(backupPath, {
      recursive: true,
      force: true,
    });
  }

  async clearInsightDirectory(insightPath: string): Promise<void> {
    const versionFilePath = path.resolve(this.getVersionFilePath(insightPath));
    const items = await fs.promises.readdir(insightPath);

    for (const item of items) {
      const itemPath = path.resolve(path.join(insightPath, item));

      if (itemPath === versionFilePath) {
        continue;
      }

      const stat = await fs.promises.stat(itemPath);

      if (stat.isDirectory()) {
        await fs.promises.rm(itemPath, {
          recursive: true,
          force: true,
        });
      }
      else {
        await fs.promises.unlink(itemPath);
      }
    }
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    const isWindows = process.platform === 'win32';
    const attempts: DownloadAttempt[] = [];

    try {
      await execFileAsync('wget', buildWgetArgs(destPath, url));

      return;
    }
    catch (error) {
      attempts.push({
        method: 'wget',
        command: buildWgetCommand(destPath, url),
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }

    try {
      await execFileAsync('curl', buildCurlArgs(destPath, url));

      return;
    }
    catch (error) {
      attempts.push({
        method: 'curl',
        command: buildCurlCommand(destPath, url),
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }

    if (isWindows) {
      const powershellInnerCommand = `Invoke-WebRequest -Uri "${url}" -OutFile "${destPath}" -UserAgent "${USER_AGENT}" -Referer "${REFERER}" -MaximumRedirection 5 -UseBasicParsing`;

      try {
        await execFileAsync('powershell.exe', [
          '-Command',
          powershellInnerCommand,
        ]);

        return;
      }
      catch (error) {
        attempts.push({
          method: 'PowerShell',
          command: `powershell.exe -Command "${powershellInnerCommand}"`,
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    try {
      await this.downloadFileWithNodeHttp(url, destPath);

      return;
    }
    catch (error) {
      attempts.push({
        method: 'Node.js HTTP',
        command: `Node.js HTTP download from ${url} to ${destPath}`,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }

    const attemptsDetails = attempts.map((attempt, index) => {
      return `${index + 1}. [${attempt.method}] ${attempt.command}\n   Error: ${attempt.error}`;
    })
      .join('\n\n');

    throw new Error(`All download methods failed.\n\nAttempted commands:\n${attemptsDetails}`);
  }

  private async downloadFileWithNodeHttp(url: string, destPath: string, redirectCount: number = 0): Promise<void> {
    if (redirectCount > 5) {
      throw new Error('Too many redirects');
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Referer': 'https://gitcode.net/',
        },
      };

      const req = protocol.get(options, (res) => {
        if (res.statusCode && [
          301,
          302,
          307,
          308,
        ].includes(res.statusCode)) {
          const redirectUrl = res.headers.location;

          if (redirectUrl) {
            this.downloadFileWithNodeHttp(redirectUrl, destPath, redirectCount + 1)
              .then(resolve)
              .catch(reject);

            return;
          }
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Download failed with status ${res.statusCode}`));

          return;
        }

        const fileStream = fs.createWriteStream(destPath);

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fileStream.close();
          fs.unlink(destPath, () => { });
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  async unzipFile(zipPath: string, destPath: string): Promise<void> {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      return;
    }

    const rootFolderName = this.findCommonRootFolder(zipEntries);

    if (rootFolderName) {
      for (const entry of zipEntries) {
        if (entry.entryName === rootFolderName) {
          continue;
        }

        if (!entry.entryName.startsWith(rootFolderName)) {
          continue;
        }

        const relativePath = entry.entryName.substring(rootFolderName.length);

        if (!relativePath) {
          continue;
        }

        const targetPath = path.join(destPath, relativePath);

        if (entry.isDirectory) {
          await fs.promises.mkdir(targetPath, { recursive: true });
        }
        else {
          const data = zip.readFile(entry);

          if (data) {
            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.promises.writeFile(targetPath, data);
          }
        }
      }
    }
    else {
      zip.extractAllTo(destPath, true);
    }
  }

  private findCommonRootFolder(entries: AdmZip.IZipEntry[]): string | null {
    if (entries.length === 0) {
      return null;
    }

    const directoryEntries = entries.filter((entry) => entry.isDirectory);

    if (directoryEntries.length === 0) {
      return null;
    }

    const rootCandidates = new Set<string>();

    for (const entry of directoryEntries) {
      const parts = entry.entryName.split('/')
        .filter((p) => p);

      if (parts.length > 0) {
        rootCandidates.add(parts[0] + '/');
      }
    }

    for (const candidate of rootCandidates) {
      const allEntriesMatch = entries.every((entry) => {
        if (entry.entryName === candidate) {
          return true;
        }

        return entry.entryName.startsWith(candidate);
      });

      if (allEntriesMatch) {
        return candidate;
      }
    }

    return null;
  }

  async downloadAndExtractInsight(mapping: InsightVersionMapping, insightPath: string): Promise<void> {
    const zipPath = path.join(insightPath, 'insight.zip');

    try {
      await fs.promises.mkdir(insightPath, { recursive: true });

      await this.downloadFile(mapping.downloadUrl, zipPath);

      await this.validateZipFile(zipPath);

      await this.unzipFile(zipPath, insightPath);

      await this.validateInsightInstallation(insightPath);

      await fs.promises.unlink(zipPath);
    }
    catch (error) {
      if (fs.existsSync(zipPath)) {
        await fs.promises.unlink(zipPath)
          .catch(() => { });
      }

      throw error;
    }
  }

  private async validateInsightInstallation(insightPath: string): Promise<void> {
    const indexHtmlPath = path.join(insightPath, 'index.html');

    if (!fs.existsSync(indexHtmlPath)) {
      throw new Error('Insight installation validation failed: index.html not found');
    }
  }

  private async validateZipFile(zipPath: string): Promise<void> {
    if (!fs.existsSync(zipPath)) {
      throw new Error('Downloaded file not found');
    }

    const stats = await fs.promises.stat(zipPath);

    if (stats.size === 0) {
      throw new Error('Downloaded file is empty');
    }

    const buffer = await fs.promises.readFile(zipPath);

    if (buffer.length < 4) {
      throw new Error('Downloaded file is too small');
    }

    const magic = buffer.readUInt32LE(0);

    if (magic !== 0x04034B50) {
      let contentPreview = buffer.toString('utf8', 0, Math.min(500, buffer.length));

      contentPreview = contentPreview.replace(/\s+/g, ' ')
        .trim();

      throw new Error(`Downloaded file is not a valid ZIP file. Magic: ${magic.toString(16)}. Content preview: ${contentPreview}`);
    }
  }

  async initializeInsight(context: vscode.ExtensionContext): Promise<void> {
    const insightPath = this.resolveInsightPath(context);
    const packageJson = context.extension.packageJSON;
    const pluginVersion = packageJson.version as string;

    const matchingMapping = this.findMatchingInsightVersion(pluginVersion);

    if (!matchingMapping) {
      return;
    }

    const currentVersionJson = await this.readVersionFile(insightPath);
    const hasIndexHtml = fs.existsSync(path.join(insightPath, 'index.html'));

    if (!fs.existsSync(insightPath)) {
      await fs.promises.mkdir(insightPath, { recursive: true });
    }

    if (!currentVersionJson) {
      if (hasIndexHtml) {
        await this.createDefaultVersionFile(insightPath);

        return;
      }

      try {
        await this.downloadAndExtractInsight(matchingMapping, insightPath);
        await this.updateVersionFile(insightPath, matchingMapping.insightVersion);
      }
      catch (error) {
        this.showDownloadFailedMessage(matchingMapping, insightPath, error);

        throw error;
      }

      return;
    }

    if (currentVersionJson.version !== matchingMapping.insightVersion) {
      await this.backupInsight(insightPath);

      try {
        await this.clearInsightDirectory(insightPath);
        await this.downloadAndExtractInsight(matchingMapping, insightPath);
        await this.updateVersionFile(insightPath, matchingMapping.insightVersion);

        const backupPath = this.getBackupPath(insightPath);

        if (fs.existsSync(backupPath)) {
          await fs.promises.rm(backupPath, {
            recursive: true,
            force: true,
          });
        }
      }
      catch (error) {
        await this.restoreInsight(insightPath);

        this.showDownloadFailedMessage(matchingMapping, insightPath, error);

        throw error;
      }
    }
  }

  private showDownloadFailedMessage(mapping: InsightVersionMapping, insightPath: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : t('insight.downloadErrorUnknown');
    const zipPath = path.join(insightPath, 'insight.zip');
    const downloadCommand = buildWgetCommand(zipPath, mapping.downloadUrl);
    const message = t('insight.downloadFailed', {
      error: errorMessage,
      path: insightPath,
      url: mapping.downloadUrl,
      downloadCommand,
    });

    vscode.window.showErrorMessage(message);
  }
}

export const insightService = InsightService.getInstance();
