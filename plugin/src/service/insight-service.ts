import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';

const execFileAsync = promisify(execFile);

import {
  INSIGHT_VERSION_MAPPINGS,
  INSIGHT_VERSION_FILE_NAME,
  INSIGHT_BACKUP_SUFFIX,
} from '../constants';
import {
  type InsightVersionMapping,
  type InsightVersionJson,
  type InsightVersionHistory,
} from './insight-types';

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
    const envPath = process.env.INSIGHT_HOME_PATH;

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

    if (!isWindows) {
      try {
        await execFileAsync('wget', [
          '-q',
          '-O',
          destPath,
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          '--referer=https://gitcode.net/',
          '--max-redirect=5',
          url,
        ]);

        return;
      }
      catch {
        try {
          await execFileAsync('curl', [
            '-sSL',
            '-o',
            destPath,
            '-A',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-e',
            'https://gitcode.net/',
            '-L',
            url,
          ]);

          return;
        }
        catch {
          // Fall through to Node.js http download
        }
      }
    }

    try {
      await execFileAsync('powershell.exe', [
        '-Command',
        `Invoke-WebRequest -Uri "${url}" -OutFile "${destPath}" -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -Referer "https://gitcode.net/" -MaximumRedirection 5 -UseBasicParsing`,
      ]);

      return;
    }
    catch {
      throw new Error('Failed to download file: neither wget, curl nor PowerShell is available');
    }
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const message = `Insight 下载失败：${errorMessage}\n\n请手动下载 Insight 后解压到以下目录：\n${insightPath}\n\n下载地址：${mapping.downloadUrl}\n\n解压后该目录下应存在 index.html 文件。`;

    vscode.window.showErrorMessage(message);
  }
}

export const insightService = InsightService.getInstance();
