/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CommandExecutor } from '@plugin/class/command-options';

/**
 * 算子工程类型枚举
 */
export enum OperatorProjectType {
  /** 标准自定义算子工程 */
  STANDARD_CUSTOM = 'standard-custom',
  /** <<<>>>算子工程 */
  ASCEND_C = 'ascend-c',
  /** torch_library算子工程 */
  TORCH_LIBRARY = 'torch-library',
  /** pyasc算子工程 */
  PYASC = 'pyasc',
  /** 多算子工程集合 */
  MULTI_PROJECT = 'multi-project',
}

/**
 * 算子工程检测结果
 */
export interface OperatorProjectDetectionResult {
  /** 是否为算子工程 */
  isOperatorProject: boolean;
  /** 算子工程类型 */
  projectType?: OperatorProjectType;
  /** 项目路径 */
  projectPath: string;
  /** 项目名称 */
  projectName: string;
}

/**
 * 算子工程检测器
 */
export class OperatorProjectDetector {
  /**
   * 检测目录是否为算子工程
   * @param dirPath 目录路径
   * @returns 检测结果
   */
  static async detectOperatorProject(dirPath: string): Promise<OperatorProjectDetectionResult> {
    const projectName = path.basename(dirPath);
    console.log(`[OperatorProjectDetector] 检测目录: ${dirPath}`);
    console.log(`[OperatorProjectDetector] 项目名称: ${projectName}`);
    
    // 检查是否为标准自定义算子工程
    const buildShPath = path.join(dirPath, 'build.sh');
    console.log(`[OperatorProjectDetector] 检查 build.sh: ${buildShPath}`);
    if (fs.existsSync(buildShPath)) {
      console.log(`[OperatorProjectDetector] build.sh 存在，开始检测`);
      
      // 首先尝试读取文件内容来检测（更可靠，跨平台）
      try {
        const buildShContent = fs.readFileSync(buildShPath, 'utf-8');
        console.log(`[OperatorProjectDetector] build.sh 文件大小: ${buildShContent.length} 字符`);
        
        // 检查文件内容中是否包含 --genop（标准自定义算子工程的标志）
        if (buildShContent.includes('--genop')) {
          console.log(`[OperatorProjectDetector] 在 build.sh 内容中检测到 --genop，确认为标准自定义算子工程`);
          return {
            isOperatorProject: true,
            projectType: OperatorProjectType.STANDARD_CUSTOM,
            projectPath: dirPath,
            projectName,
          };
        }
        
        console.log(`[OperatorProjectDetector] build.sh 内容中未找到 --genop，尝试执行 --help 检测`);
      } catch (readError) {
        console.warn(`[OperatorProjectDetector] 读取 build.sh 文件失败: ${readError}`);
      }
      
      // 如果文件内容检测失败，尝试执行命令检测（仅在非 Windows 或 bash 可用时）
      try {
        const executor = new CommandExecutor();
        // 使用引号包裹路径，确保路径中的空格和特殊字符被正确处理
        const quotedPath = process.platform === 'win32'
          ? `"${buildShPath.replace(/\\/g, '/')}"`
          : `"${buildShPath}"`;
        const command = `bash ${quotedPath} --help`;
        
        console.log(`[OperatorProjectDetector] 执行命令: ${command}`);
        const result = await executor.execute(command, [], [], { timeout: 5000 });
        
        // 检查命令执行结果
        if (result.code !== 0 && result.code !== null) {
          console.log(`[OperatorProjectDetector] build.sh --help 执行失败，退出码: ${result.code}`);
          if (result.stderr) {
            console.log(`[OperatorProjectDetector] stderr: ${result.stderr.substring(0, 200)}`);
          }
          // 命令执行失败，继续其他检测
        } else {
          const output = result.stdout || result.stderr || '';
          console.log(`[OperatorProjectDetector] build.sh --help 输出长度: ${output.length}`);
          
          if (output.length > 0) {
            console.log(`[OperatorProjectDetector] build.sh --help 输出: ${output.substring(0, 200)}`);
          }
          
          if (output.includes('--genop')) {
            console.log(`[OperatorProjectDetector] 检测到标准自定义算子工程: ${dirPath}`);
            return {
              isOperatorProject: true,
              projectType: OperatorProjectType.STANDARD_CUSTOM,
              projectPath: dirPath,
              projectName,
            };
          } else {
            console.log(`[OperatorProjectDetector] build.sh 输出中未找到 --genop`);
          }
        }
      } catch (error) {
        // 如果执行失败，继续其他检测
        console.warn(`[OperatorProjectDetector] 检测 build.sh --help 失败: ${error}`);
        if (error instanceof Error) {
          console.warn(`[OperatorProjectDetector] 错误详情: ${error.message}`);
        }
      }
    } else {
      console.log(`[OperatorProjectDetector] build.sh 不存在`);
    }

    // 检查 CMakeLists.txt 是否存在
    const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');
    const hasCMakeLists = fs.existsSync(cmakeListsPath);
    console.log(`[OperatorProjectDetector] CMakeLists.txt 存在: ${hasCMakeLists}`);

    // 检查是否有 .asc 文件
    const hasAscFiles = this.hasAscFiles(dirPath);
    console.log(`[OperatorProjectDetector] .asc 文件存在: ${hasAscFiles}`);

    // 检查是否有 .py 文件（与 CMakeLists.txt 同级目录）
    const hasPyFiles = this.hasPyFiles(dirPath);
    console.log(`[OperatorProjectDetector] .py 文件存在: ${hasPyFiles}`);

    // 判断算子工程类型
    if (hasCMakeLists && hasAscFiles && !hasPyFiles) {
      // 有 CMakeLists.txt 和 .asc 文件，但没有 .py 文件 -> <<<>>>算子工程
      console.log(`[OperatorProjectDetector] 检测到 <<<>>>算子工程: ${dirPath}`);
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.ASCEND_C,
        projectPath: dirPath,
        projectName,
      };
    }

    if (hasCMakeLists && hasPyFiles) {
      // 有 CMakeLists.txt 和 .py 文件 -> torch_library算子工程
      console.log(`[OperatorProjectDetector] 检测到 torch_library算子工程: ${dirPath}`);
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.TORCH_LIBRARY,
        projectPath: dirPath,
        projectName,
      };
    }

    if (hasPyFiles && !hasCMakeLists) {
      // 有 .py 文件但没有 CMakeLists.txt -> pyasc算子工程
      console.log(`[OperatorProjectDetector] 检测到 pyasc算子工程: ${dirPath}`);
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: dirPath,
        projectName,
      };
    }

    console.log(`[OperatorProjectDetector] 不是算子工程: ${dirPath}`);
    return {
      isOperatorProject: false,
      projectPath: dirPath,
      projectName,
    };
  }

  /**
   * 检查目录下是否有 .asc 文件
   */
  private static hasAscFiles(dirPath: string): boolean {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.asc')) {
          return true;
        }
        if (entry.isDirectory()) {
          // 递归检查子目录（限制深度避免性能问题）
          if (this.hasAscFilesRecursive(path.join(dirPath, entry.name), 2)) {
            return true;
          }
        }
      }
    } catch (error) {
      console.warn(`检查 .asc 文件失败: ${error}`);
    }
    return false;
  }

  /**
   * 递归检查 .asc 文件（限制深度）
   */
  private static hasAscFilesRecursive(dirPath: string, maxDepth: number): boolean {
    if (maxDepth <= 0) {
      return false;
    }
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.asc')) {
          return true;
        }
        if (entry.isDirectory() && maxDepth > 1) {
          if (this.hasAscFilesRecursive(path.join(dirPath, entry.name), maxDepth - 1)) {
            return true;
          }
        }
      }
    } catch (error) {
      // 忽略错误
    }
    return false;
  }

  /**
   * 检查目录下是否有 .py 文件（与 CMakeLists.txt 同级）
   */
  private static hasPyFiles(dirPath: string): boolean {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.py')) {
          return true;
        }
      }
    } catch (error) {
      console.warn(`检查 .py 文件失败: ${error}`);
    }
    return false;
  }

  /**
   * 递归扫描目录，查找算子工程（最多扫描3层）
   * @param rootPath 根目录路径
   * @param maxDepth 最大深度（默认3层）
   * @returns 检测到的算子工程列表
   */
  static async scanForOperatorProjects(
    rootPath: string,
    maxDepth: number = 3,
  ): Promise<OperatorProjectDetectionResult[]> {
    console.log(`[OperatorProjectDetector] 开始扫描算子工程`);
    console.log(`[OperatorProjectDetector] 根路径: ${rootPath}`);
    console.log(`[OperatorProjectDetector] 最大深度: ${maxDepth}`);
    const results: OperatorProjectDetectionResult[] = [];
    
    await this.scanDirectory(rootPath, 0, maxDepth, results);
    
    console.log(`[OperatorProjectDetector] 扫描完成，找到 ${results.length} 个算子工程`);
    results.forEach((result, index) => {
      console.log(`[OperatorProjectDetector] 算子工程 ${index + 1}: ${result.projectName} (${result.projectType}) at ${result.projectPath}`);
    });
    
    return results;
  }

  /**
   * 递归扫描目录
   */
  private static async scanDirectory(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    results: OperatorProjectDetectionResult[],
  ): Promise<void> {
    console.log(`[OperatorProjectDetector] 扫描目录 (深度 ${currentDepth}/${maxDepth}): ${dirPath}`);
    
    if (currentDepth > maxDepth) {
      console.log(`[OperatorProjectDetector] 达到最大深度，停止扫描: ${dirPath}`);
      return;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      console.log(`[OperatorProjectDetector] 目录 ${dirPath} 包含 ${entries.length} 个条目`);
      
      // 先检测当前目录是否为算子工程
      const detection = await this.detectOperatorProject(dirPath);
      if (detection.isOperatorProject) {
        console.log(`[OperatorProjectDetector] 找到算子工程，添加到结果列表: ${dirPath}`);
        results.push(detection);
        // 如果当前目录是算子工程，不再扫描子目录
        return;
      }

      // 如果当前目录不是算子工程，继续扫描子目录
      if (currentDepth < maxDepth) {
        const subDirs: string[] = [];
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // 跳过一些常见的非算子工程目录
            const dirName = entry.name;
            if (
              dirName.startsWith('.') ||
              dirName === 'node_modules' ||
              dirName === 'out' ||
              dirName === 'build'
            ) {
              console.log(`[OperatorProjectDetector] 跳过目录: ${dirName}`);
              continue;
            }

            const subDirPath = path.join(dirPath, entry.name);
            subDirs.push(subDirPath);
          }
        }
        
        console.log(`[OperatorProjectDetector] 准备扫描 ${subDirs.length} 个子目录`);
        for (const subDirPath of subDirs) {
          await this.scanDirectory(subDirPath, currentDepth + 1, maxDepth, results);
        }
      } else {
        console.log(`[OperatorProjectDetector] 已达到最大深度，不扫描子目录: ${dirPath}`);
      }
    } catch (error) {
      console.warn(`[OperatorProjectDetector] 扫描目录失败 ${dirPath}: ${error}`);
      if (error instanceof Error) {
        console.warn(`[OperatorProjectDetector] 错误堆栈:`, error.stack);
      }
    }
  }
}
