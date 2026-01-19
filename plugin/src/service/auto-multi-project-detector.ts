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
   * @param context 扩展上下文
   */
  static async detectAndMarkMultiProjects(context: vscode.ExtensionContext): Promise<void> {
    try {
      console.log('[AutoMultiProjectDetector] 开始自动检测算子工程合集');
      
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
      
      // 按父目录分组
      const parentDirMap = new Map<string, typeof singleProjects>();
      
      for (const project of singleProjects) {
        const parentDir = path.dirname(project.project_path);
        const normalizedParentDir = path.normalize(parentDir).replace(/\\/g, '/');
        
        if (!parentDirMap.has(normalizedParentDir)) {
          parentDirMap.set(normalizedParentDir, []);
        }
        parentDirMap.get(normalizedParentDir)!.push(project);
      }
      
      console.log(`[AutoMultiProjectDetector] 找到 ${parentDirMap.size} 个不同的父目录`);
      
      // 检查每个父目录，如果有多个算子工程，标记为合集
      // 注意：只标记直接包含多个算子工程的目录，不递归向上或向下标记
      let markedCount = 0;
      
      // 只进行一次检测，不递归
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
          
          console.log(`[AutoMultiProjectDetector] 检测到父目录 "${parentDir}" 下有 ${projects.length} 个算子工程，准备标记为合集`);
          
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
        console.log(`[AutoMultiProjectDetector] 开始更新图标主题...`);
        try {
          const iconTheme = OperatorProjectIconTheme.getInstance(context);
          await iconTheme.updateIconTheme();
          console.log(`[AutoMultiProjectDetector] ✓ 图标主题已更新`);
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
