/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getAllProjects } from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';

/**
 * 算子工程图标主题管理器
 * 参考 D:\msttObj\各种demo\icon-file 的实现方式
 */
export class OperatorProjectIconTheme {
  private static instance: OperatorProjectIconTheme;
  private context: vscode.ExtensionContext;
  private iconThemePath: string;
  private iconThemeJsonPath: string;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    // 图标主题文件路径（必须放在扩展目录内，File Icon Theme 要求）
    this.iconThemePath = path.join(context.extensionPath, 'resources', 'operator-project-icons');
    this.iconThemeJsonPath = path.join(this.iconThemePath, 'operator-project-icon-theme.json');

    // 确保目录存在
    if (!fs.existsSync(this.iconThemePath)) {
      fs.mkdirSync(this.iconThemePath, { recursive: true });
    }
  }

  static getInstance(context: vscode.ExtensionContext): OperatorProjectIconTheme {
    if (!OperatorProjectIconTheme.instance) {
      OperatorProjectIconTheme.instance = new OperatorProjectIconTheme(context);
    }
    return OperatorProjectIconTheme.instance;
  }

  /**
   * 更新图标主题配置
   * 根据已注册的算子工程动态生成图标映射
   */
  async updateIconTheme(): Promise<void> {
    try {
      console.log(`[OperatorProjectIconTheme] ========== 开始更新图标主题 ==========`);
      
      // 获取所有已注册的算子工程
      let projects = getAllProjects();
      
      // 过滤：只处理当前工作区内的项目
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePaths = workspaceFolders.map(f => path.normalize(f.uri.fsPath).toLowerCase());
        projects = projects.filter(project => {
          if (!project.project_path) return false;
          const projectPath = path.normalize(project.project_path).toLowerCase();
          // 检查项目路径是否在当前工作区的任何文件夹下
          return workspacePaths.some(wsPath => projectPath.startsWith(wsPath));
        });
        console.log(`[OperatorProjectIconTheme] 过滤后，共 ${projects.length} 个项目在当前工作区内`);
      } else {
        console.log(`[OperatorProjectIconTheme] 没有打开的工作区，跳过图标更新`);
        return;
      }
      
      console.log(`[OperatorProjectIconTheme] 共 ${projects.length} 个项目需要处理`);

      // 复制图标文件到主题目录
      await this.copyIconFiles();

      // 生成图标主题 JSON
      const iconThemeJson = this.generateIconThemeJson(projects);

      // 写入文件
      fs.writeFileSync(this.iconThemeJsonPath, JSON.stringify(iconThemeJson, null, 2), 'utf-8');
      
      // 验证文件是否已写入
      if (!fs.existsSync(this.iconThemeJsonPath)) {
        throw new Error(`图标主题文件写入失败: ${this.iconThemeJsonPath}`);
      }

      const folderCount = Object.keys(iconThemeJson.folderNames).length;
      console.log(`[OperatorProjectIconTheme] 图标主题已更新: ${this.iconThemeJsonPath}`);
      console.log(`[OperatorProjectIconTheme] 映射了 ${folderCount} 个文件夹`);
      console.log(`[OperatorProjectIconTheme] folderNames:`, JSON.stringify(iconThemeJson.folderNames, null, 2));

      // 确保图标主题被激活
      const currentIconTheme = vscode.workspace.getConfiguration('workbench').get('iconTheme');
      if (currentIconTheme !== 'operator-project-icon-theme') {
        console.log(`[OperatorProjectIconTheme] 当前图标主题: ${currentIconTheme}，切换到 operator-project-icon-theme`);
        await vscode.workspace.getConfiguration('workbench').update('iconTheme', 'operator-project-icon-theme', vscode.ConfigurationTarget.Global);
        // 等待主题切换完成
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 刷新资源管理器以更新图标
      setTimeout(() => {
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
      }, 200);
    } catch (error) {
      console.error(`[OperatorProjectIconTheme] 更新图标主题失败:`, error);
      if (error instanceof Error) {
        console.error(`[OperatorProjectIconTheme] 错误详情:`, error.message);
        console.error(`[OperatorProjectIconTheme] 错误堆栈:`, error.stack);
      }
    }
  }

  /**
   * 复制图标文件到主题目录
   */
  private async copyIconFiles(): Promise<void> {
    try {
      // 源图标文件路径（在 web/src/assets/svg/ 目录下）
      const webAssetsPath = path.join(this.context.extensionPath, 'web', 'src', 'assets', 'svg');
      const settingIconSource = path.join(webAssetsPath, 'setting.svg');
      const powerIconSource = path.join(webAssetsPath, 'power.svg');

      // 目标图标文件路径（在 resources/operator-project-icons/ 目录下）
      const settingIconDest = path.join(this.iconThemePath, 'setting.svg');
      const powerIconDest = path.join(this.iconThemePath, 'power.svg');

      // 确保目标目录存在
      if (!fs.existsSync(this.iconThemePath)) {
        fs.mkdirSync(this.iconThemePath, { recursive: true });
      }

      // 复制图标文件
      if (fs.existsSync(settingIconSource)) {
        fs.copyFileSync(settingIconSource, settingIconDest);
        console.log(`[OperatorProjectIconTheme] ✓ 已复制 setting.svg: ${settingIconDest}`);
      } else {
        console.warn(`[OperatorProjectIconTheme] ✗ setting.svg 源文件不存在: ${settingIconSource}`);
      }

      if (fs.existsSync(powerIconSource)) {
        fs.copyFileSync(powerIconSource, powerIconDest);
        console.log(`[OperatorProjectIconTheme] ✓ 已复制 power.svg: ${powerIconDest}`);
      } else {
        console.warn(`[OperatorProjectIconTheme] ✗ power.svg 源文件不存在: ${powerIconSource}`);
      }

      // 验证文件是否成功复制
      if (!fs.existsSync(settingIconDest)) {
        console.error(`[OperatorProjectIconTheme] ✗ setting.svg 复制后不存在: ${settingIconDest}`);
      }
      if (!fs.existsSync(powerIconDest)) {
        console.error(`[OperatorProjectIconTheme] ✗ power.svg 复制后不存在: ${powerIconDest}`);
      }
    } catch (error) {
      console.error(`[OperatorProjectIconTheme] 复制图标文件失败:`, error);
      if (error instanceof Error) {
        console.error(`[OperatorProjectIconTheme] 错误详情:`, error.message);
        console.error(`[OperatorProjectIconTheme] 错误堆栈:`, error.stack);
      }
    }
  }

  /**
   * 生成图标主题 JSON 配置
   * 参考参考工程的实现方式
   */
  private generateIconThemeJson(projects: any[]): any {
    const folderNames: Record<string, string> = {};
    const folderNamesExpanded: Record<string, string> = {};

    // 为每个算子工程创建图标映射
    for (const project of projects) {
      if (!project.project_path || !project.project_type) {
        console.log(`[OperatorProjectIconTheme] 跳过项目（缺少路径或类型）: ${project.project_name || 'unknown'}`);
        continue;
      }

      // 规范化路径，确保路径格式一致
      const normalizedPath = path.normalize(project.project_path);
      const folderName = path.basename(normalizedPath);
      const isMultiProject = project.project_type === OperatorProjectType.MULTI_PROJECT;

      console.log(`[OperatorProjectIconTheme] 处理项目:`);
      console.log(`  项目名称: ${project.project_name}`);
      console.log(`  原始路径: ${project.project_path}`);
      console.log(`  规范化路径: ${normalizedPath}`);
      console.log(`  文件夹名: ${folderName}`);
      console.log(`  项目类型: ${project.project_type}`);
      console.log(`  是否多项目: ${isMultiProject}`);

      // 如果文件夹名称已存在，检查是否有冲突
      if (folderNames[folderName] && folderNames[folderName] !== (isMultiProject ? 'operator-project-set-folder' : 'operator-project-folder')) {
        console.warn(`[OperatorProjectIconTheme] 警告: 文件夹名称 "${folderName}" 已存在，但类型不同。将使用最新类型。`);
      }

      if (isMultiProject) {
        // 算子工程合集使用 power.svg
        folderNames[folderName] = 'operator-project-set-folder';
        folderNamesExpanded[folderName] = 'operator-project-set-folder';
        console.log(`[OperatorProjectIconTheme] ✓ 添加多算子工程集合映射: ${folderName} -> operator-project-set-folder`);
      } else {
        // 单个算子工程使用 setting.svg
        folderNames[folderName] = 'operator-project-folder';
        folderNamesExpanded[folderName] = 'operator-project-folder';
        console.log(`[OperatorProjectIconTheme] ✓ 添加算子工程映射: ${folderName} -> operator-project-folder`);
      }
    }

    // 生成图标主题 JSON（参考参考工程的格式）
    const themeJson: any = {
      iconDefinitions: {
        'operator-project-folder': {
          iconPath: './setting.svg',
        },
        'operator-project-set-folder': {
          iconPath: './power.svg',
        },
      },
      folderNames,
      folderNamesExpanded,
    };
    
    console.log(`[OperatorProjectIconTheme] 生成的图标主题 JSON:`, JSON.stringify(themeJson, null, 2));
    
    return themeJson;
  }
}
