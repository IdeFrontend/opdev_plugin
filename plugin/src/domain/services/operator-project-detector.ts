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
   * 按照以下顺序检测：
   * 1. 标准自定义算子：通过 build.sh --help 进行判断，存在 --genop
   * 2. <<<>>>算子工程默认模式：根目录存在 CMakeLists.txt 文件和 *.asc 文件
   * 3. <<<>>>算子的 torch_library 算子工程：根目录存在 CMakeLists.txt 文件和 *.py 文件
   * 4. pyasc 工程：根目录下有 *.py 文件，没有 CMakeLists.txt 文件
   * @param dirPath 目录路径
   * @returns 检测结果
   */
  static async detectOperatorProject(dirPath: string): Promise<OperatorProjectDetectionResult> {
    const projectName = path.basename(dirPath);
    console.log(`[OperatorProjectDetector] 检测目录: ${dirPath}`);
    console.log(`[OperatorProjectDetector] 项目名称: ${projectName}`);
    
    // 1. 检查是否为标准自定义算子工程（优先级最高）
    // 标准自定义算子：通过 build.sh --help 进行判断，存在 --genop
    const buildShPath = path.join(dirPath, 'build.sh');
    console.log(`[OperatorProjectDetector] 检查 build.sh: ${buildShPath}`);
    if (fs.existsSync(buildShPath)) {
      console.log(`[OperatorProjectDetector] build.sh 存在，开始检测标准自定义算子`);
      
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
            console.log(`[OperatorProjectDetector] build.sh 输出中未找到 --genop，继续检测其他类型`);
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
      console.log(`[OperatorProjectDetector] build.sh 不存在，跳过标准自定义算子检测`);
    }

    // 2. 检查 CMakeLists.txt 是否存在
    const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');
    const hasCMakeLists = fs.existsSync(cmakeListsPath);
    console.log(`[OperatorProjectDetector] CMakeLists.txt 存在: ${hasCMakeLists}`);

    // 3. 检查是否有 .asc 文件（根目录）
    const hasAscFiles = this.hasAscFiles(dirPath);
    console.log(`[OperatorProjectDetector] .asc 文件存在: ${hasAscFiles}`);

    // 4. 检查是否有 .py 文件（根目录，与 CMakeLists.txt 同级）
    const hasPyFiles = this.hasPyFiles(dirPath);
    console.log(`[OperatorProjectDetector] .py 文件存在: ${hasPyFiles}`);

    // 5. 判断算子工程类型（按照优先级顺序）
    
    // <<<>>>算子工程默认模式：根目录存在 CMakeLists.txt 文件和 *.asc 文件
    if (hasCMakeLists && hasAscFiles && !hasPyFiles) {
      console.log(`[OperatorProjectDetector] 检测到 <<<>>>算子工程: ${dirPath}`);
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.ASCEND_C,
        projectPath: dirPath,
        projectName,
      };
    }

    // <<<>>>算子的 torch_library 算子工程：根目录存在 CMakeLists.txt 文件和 *.py 文件
    if (hasCMakeLists && hasPyFiles) {
      console.log(`[OperatorProjectDetector] 检测到 torch_library算子工程: ${dirPath}`);
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.TORCH_LIBRARY,
        projectPath: dirPath,
        projectName,
      };
    }

    // 标准自定义算子：有 CMakeLists.txt，但没有 .asc 文件也没有 .py 文件
    // 判断条件：
    // 1. 路径中包含 experimental（标准自定义算子的常见结构）
    // 2. 或者父目录有 build.sh（标准自定义算子通常在包含 build.sh 的目录下）
    // 3. 或者向上查找，找到包含 build.sh 的目录（标准自定义算子的根目录通常有 build.sh）
    if (hasCMakeLists && !hasAscFiles && !hasPyFiles) {
      const normalizedPath = path.normalize(dirPath).toLowerCase();
      const hasExperimentalInPath = normalizedPath.includes('experimental');
      
      // 检查父目录是否有 build.sh
      let parentHasBuildSh = false;
      try {
        const parentDir = path.dirname(dirPath);
        const parentBuildSh = path.join(parentDir, 'build.sh');
        parentHasBuildSh = fs.existsSync(parentBuildSh);
      } catch (error) {
        // 忽略错误
      }
      
      // 向上查找，看是否有包含 build.sh 的目录（最多向上查找3层）
      let ancestorHasBuildSh = false;
      if (!parentHasBuildSh && !hasExperimentalInPath) {
        try {
          let currentDir = path.dirname(dirPath);
          for (let i = 0; i < 3; i++) {
            const buildShPath = path.join(currentDir, 'build.sh');
            if (fs.existsSync(buildShPath)) {
              // 检查 build.sh 是否包含 --genop
              try {
                const buildShContent = fs.readFileSync(buildShPath, 'utf-8');
                if (buildShContent.includes('--genop')) {
                  ancestorHasBuildSh = true;
                  break;
                }
              } catch (error) {
                // 忽略读取错误
              }
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
              // 已经到达根目录
              break;
            }
            currentDir = parentDir;
          }
        } catch (error) {
          // 忽略错误
        }
      }
      
      if (hasExperimentalInPath || parentHasBuildSh || ancestorHasBuildSh) {
        console.log(`[OperatorProjectDetector] 检测到标准自定义算子工程（通过 CMakeLists.txt）: ${dirPath}`);
        return {
          isOperatorProject: true,
          projectType: OperatorProjectType.STANDARD_CUSTOM,
          projectPath: dirPath,
          projectName,
        };
      }
    }

    // pyasc 工程：根目录下有 *.py 文件，没有 CMakeLists.txt 文件
    if (hasPyFiles && !hasCMakeLists) {
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

  /**
   * 扫描标准自定义算子工程（用于标记为算子工程集合时）
   * 扫描规则：
   * 1. 根目录下存在 experimental 文件夹，则将experimental标记为算子工程集合
   * 2. 扫描的文件夹根目录下有CMakeLists.txt文件，则这个文件夹为算子文件，识别为算子文件后不需要再遍历算子文件的子目录了，可以去遍历其他文件了。
   * 3. 识别出来的所有算子，需要分为2类，在experimental目录下的算子会被归类为experimental算子，其他的为普通算子。
   * 4. 当一个目录的下一层目录中有多个算子目录，则将该目录标记成算子工程集合
   * @param rootPath 根目录路径
   * @param maxDepth 最大深度（默认3层）
   * @returns 检测到的算子工程列表
   */
  static async scanForStandardCustomOperatorProjects(
    rootPath: string,
    maxDepth: number = 3,
  ): Promise<OperatorProjectDetectionResult[]> {
    console.log(`[OperatorProjectDetector] 开始扫描标准自定义算子工程`);
    console.log(`[OperatorProjectDetector] 根路径: ${rootPath}`);
    console.log(`[OperatorProjectDetector] 最大深度: ${maxDepth}`);
    
    const results: OperatorProjectDetectionResult[] = [];
    const experimentalPath = path.join(rootPath, 'experimental');
    const hasExperimental = fs.existsSync(experimentalPath) && fs.statSync(experimentalPath).isDirectory();
    
    console.log(`[OperatorProjectDetector] experimental 文件夹存在: ${hasExperimental}, 路径: ${experimentalPath}`);
    
    await this.scanStandardCustomDirectory(rootPath, 0, maxDepth, results, experimentalPath);
    
    console.log(`[OperatorProjectDetector] 扫描完成，找到 ${results.length} 个算子工程`);
    results.forEach((result, index) => {
      console.log(`[OperatorProjectDetector] 算子工程 ${index + 1}: ${result.projectName} at ${result.projectPath}`);
    });
    
    return results;
  }

  /**
   * 递归扫描标准自定义算子目录
   * 规则：如果目录下有CMakeLists.txt，则认为是算子工程，不再扫描子目录
   */
  private static async scanStandardCustomDirectory(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    results: OperatorProjectDetectionResult[],
    experimentalPath: string,
  ): Promise<void> {
    console.log(`[OperatorProjectDetector] 扫描标准自定义算子目录 (深度 ${currentDepth}/${maxDepth}): ${dirPath}`);
    
    if (currentDepth > maxDepth) {
      console.log(`[OperatorProjectDetector] 达到最大深度，停止扫描: ${dirPath}`);
      return;
    }

    try {
      // 检查当前目录是否有 CMakeLists.txt
      const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');
      const hasCMakeLists = fs.existsSync(cmakeListsPath);
      
      console.log(`[OperatorProjectDetector] 目录 ${dirPath} hasCMakeLists: ${hasCMakeLists}`);
      
      if (hasCMakeLists) {
        // 当前目录有 CMakeLists.txt，认为是算子工程
        const projectName = path.basename(dirPath);
        const isExperimental = dirPath.toLowerCase().startsWith(experimentalPath.toLowerCase());
        
        const detection: OperatorProjectDetectionResult = {
          isOperatorProject: true,
          projectType: OperatorProjectType.STANDARD_CUSTOM,
          projectPath: dirPath,
          projectName,
        };
        
        // 添加experimental标记（如果需要的话，可以通过扩展接口传递）
        results.push(detection);
        console.log(`[OperatorProjectDetector] 找到标准自定义算子工程: ${dirPath} (experimental: ${isExperimental})`);
        
        // 即使当前目录是算子工程，也需要继续扫描子目录
        // 因为子目录可能也是算子工程（例如：math/accumulate_nv2 这种情况）
        // 但是，如果当前目录是算子工程，子目录也是算子工程，那么当前目录应该被标记为算子工程集合
        // 这里先继续扫描子目录，让调用方处理集合的标记逻辑
      }
      
      // 继续扫描子目录（无论当前目录是否是算子工程）
      // 这样可以确保所有子目录中的算子工程都被识别
      if (currentDepth < maxDepth) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
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
          await this.scanStandardCustomDirectory(subDirPath, currentDepth + 1, maxDepth, results, experimentalPath);
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
