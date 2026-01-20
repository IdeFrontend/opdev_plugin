/**
 * 自动检测并标记算子工程合集服务
 * 扫描所有算子工程，如果发现多个算子工程在同一个父目录下，自动将该目录标记为算子工程合集
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { getAllProjects, createProject, getProjectByPath } from '@plugin/domain/models/project-model';
import { OperatorProjectType } from '@plugin/domain/services/operator-project-detector';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';

/**
 * 自动检测并标记算子工程合集
 */
export class AutoMultiProjectDetector {
  /**
   * 自动检测并标记算子工程合集
   * 只在工程打开的根目录层级工作，不会递归标记更深层的目录
   * @param context 扩展上下文
   */
  static async detectAndMarkMultiProjects(context: vscode.ExtensionContext): Promise<void> {
    try {
      console.log('[AutoMultiProjectDetector] 开始自动检测算子工程合集（仅在根目录层级）');
      
      // 获取工作区根目录
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.log('[AutoMultiProjectDetector] 没有打开的工作区，跳过检测');
        return;
      }
      
      // 获取所有工作区根目录路径
      const workspaceRootPaths = workspaceFolders.map(folder => {
        const rootPath = folder.uri.fsPath;
        return path.normalize(rootPath).replace(/\\/g, '/');
      });
      console.log(`[AutoMultiProjectDetector] 工作区根目录: ${workspaceRootPaths.join(', ')}`);
      
      // 获取所有已注册的算子工程（排除已经是 MULTI_PROJECT 的项目）
      const allProjects = getAllProjects();
      const singleProjects = allProjects.filter(
        (p) => p.project_type && p.project_type !== OperatorProjectType.MULTI_PROJECT,
      );
      
      console.log(`[AutoMultiProjectDetector] 找到 ${singleProjects.length} 个单个算子工程`);
      
      if (singleProjects.length === 0) {
        console.log('[AutoMultiProjectDetector] 没有单个算子工程，跳过检测');
        return;
      }
      
      // 按父目录分组，但只处理根目录层级的父目录
      const parentDirMap = new Map<string, typeof singleProjects>();
      
      for (const project of singleProjects) {
        const parentDir = path.dirname(project.project_path);
        const normalizedParentDir = path.normalize(parentDir).replace(/\\/g, '/');
        
        // 检查父目录是否在某个工作区根目录下，且深度为1（即根目录的直接子目录）
        let isRootLevel = false;
        for (const rootPath of workspaceRootPaths) {
          if (normalizedParentDir.startsWith(rootPath)) {
            // 计算相对路径的深度
            const relativePath = normalizedParentDir.substring(rootPath.length).replace(/^[/\\]/, '');
            const depth = relativePath.split(/[/\\]/).filter(p => p.length > 0).length;
            // 只处理根目录的直接子目录（深度为1）
            if (depth === 1) {
              isRootLevel = true;
              break;
            }
          }
        }
        
        // 只处理根目录层级的父目录
        if (!isRootLevel) {
          console.log(`[AutoMultiProjectDetector] 跳过非根目录层级的父目录: ${normalizedParentDir}`);
          continue;
        }
        
        if (!parentDirMap.has(normalizedParentDir)) {
          parentDirMap.set(normalizedParentDir, []);
        }
        parentDirMap.get(normalizedParentDir)!.push(project);
      }
      
      console.log(`[AutoMultiProjectDetector] 找到 ${parentDirMap.size} 个根目录层级的父目录`);
      
      // 检查每个父目录，如果有多个算子工程，标记为合集
      // 注意：只在根目录层级标记，不会递归标记更深层的目录
      let markedCount = 0;
      
      for (const [parentDir, projects] of parentDirMap.entries()) {
        if (projects.length > 1) {
          // 检查该父目录是否已经标记为合集
          const existing = getProjectByPath(parentDir);
          
          if (existing && existing.project_type === OperatorProjectType.MULTI_PROJECT) {
            console.log(`[AutoMultiProjectDetector] 父目录 "${parentDir}" 已经是算子工程合集，跳过`);
            continue;
          }
          
          // 检查该父目录是否已经是某个算子工程（不应该被标记为合集）
          if (existing && existing.project_type !== OperatorProjectType.MULTI_PROJECT) {
            console.log(`[AutoMultiProjectDetector] 父目录 "${parentDir}" 已经是单个算子工程，跳过标记为合集`);
            continue;
          }
          
          // 检查该父目录是否已经在某个合集下（合集的子目录不可以再标记成算子合集）
          let isInCollection = false;
          const normalizedParentDir = path.normalize(parentDir).replace(/\\/g, '/');
          for (const rootPath of workspaceRootPaths) {
            if (normalizedParentDir.startsWith(rootPath)) {
              // 检查该目录的所有祖先目录是否已经是合集
              let currentDir = path.dirname(parentDir);
              while (currentDir !== rootPath && currentDir !== path.dirname(currentDir)) {
                const normalizedCurrentDir = path.normalize(currentDir).replace(/\\/g, '/');
                if (normalizedCurrentDir.startsWith(rootPath)) {
                  const ancestorProject = getProjectByPath(currentDir);
                  if (ancestorProject && ancestorProject.project_type === OperatorProjectType.MULTI_PROJECT) {
                    console.log(`[AutoMultiProjectDetector] 父目录 "${parentDir}" 已经在合集 "${currentDir}" 下，跳过标记为合集`);
                    isInCollection = true;
                    break;
                  }
                }
                const parentOfCurrent = path.dirname(currentDir);
                if (parentOfCurrent === currentDir) {
                  break;
                }
                currentDir = parentOfCurrent;
              }
              if (isInCollection) {
                break;
              }
            }
          }
          
          if (isInCollection) {
            continue;
          }
          
          console.log(`[AutoMultiProjectDetector] 检测到根目录层级的父目录 "${parentDir}" 下有 ${projects.length} 个算子工程，准备标记为合集`);
          
          // 获取所有子项目的 ID（只包含直接子项目，不包含子项目的子项目）
          const subProjectIds = projects.map((p) => p.id);
          
          // 标记为多算子工程集合
          const parentDirName = path.basename(parentDir);
          await createProject({
            project_name: parentDirName,
            project_path: parentDir,
            project_type: OperatorProjectType.MULTI_PROJECT,
            sub_project_ids: subProjectIds,
          });
          
          console.log(`[AutoMultiProjectDetector] ✓ 已标记 "${parentDir}" 为算子工程合集（包含 ${projects.length} 个子项目）`);
          markedCount++;
        }
      }
      
      if (markedCount > 0) {
        console.log(`[AutoMultiProjectDetector] 共标记了 ${markedCount} 个算子工程合集`);
        
        // 更新图标主题
        console.log(`[AutoMultiProjectDetector] 开始触发装饰更新...`);
        try {
          const iconTheme = OperatorProjectIconTheme.getInstance(context);
          iconTheme.fireDecorationUpdate();
          console.log(`[AutoMultiProjectDetector] ✓ 装饰已更新`);
        } catch (error) {
          console.error(`[AutoMultiProjectDetector] 更新图标主题失败:`, error);
          if (error instanceof Error) {
            console.error(`[AutoMultiProjectDetector] 错误详情:`, error.message);
            console.error(`[AutoMultiProjectDetector] 错误堆栈:`, error.stack);
          }
        }
      } else {
        console.log(`[AutoMultiProjectDetector] 没有需要标记的算子工程合集`);
      }
    } catch (error) {
      console.error(`[AutoMultiProjectDetector] 自动检测失败:`, error);
      if (error instanceof Error) {
        console.error(`[AutoMultiProjectDetector] 错误详情:`, error.message);
        console.error(`[AutoMultiProjectDetector] 错误堆栈:`, error.stack);
      }
    }
  }
}
