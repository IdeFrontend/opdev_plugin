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

    // 1. 检查是否为标准自定义算子工程（优先级最高）
    // 标准自定义算子：通过 build.sh --help 进行判断，存在 --genop
    const buildShPath = path.join(dirPath, 'build.sh');
    if (fs.existsSync(buildShPath)) {

      // 首先尝试读取文件内容来检测（更可靠，跨平台）
      try {
        const buildShContent = fs.readFileSync(buildShPath, 'utf-8');

        // 检查文件内容中是否包含 --genop（标准自定义算子工程的标志）
        if (buildShContent.includes('--genop')) {
          return {
            isOperatorProject: true,
            projectType: OperatorProjectType.STANDARD_CUSTOM,
            projectPath: dirPath,
            projectName,
          };
        }
      } catch (readError) {
        // 忽略读取错误
      }

      // 如果文件内容检测失败，尝试执行命令检测（仅在非 Windows 或 bash 可用时）
      try {
        const executor = new CommandExecutor();
        // 使用引号包裹路径，确保路径中的空格和特殊字符被正确处理
        const quotedPath = process.platform === 'win32'
          ? `"${buildShPath.replace(/\\/g, '/')}"`
          : `"${buildShPath}"`;
        const command = `bash ${quotedPath} --help`;
        const result = await executor.execute(command, [], [], { timeout: 5000 });

        // 检查命令执行结果
        if (result.code === 0 || result.code === null) {
          const output = result.stdout || result.stderr || '';
          if (output.includes('--genop')) {
            return {
              isOperatorProject: true,
              projectType: OperatorProjectType.STANDARD_CUSTOM,
              projectPath: dirPath,
              projectName,
            };
          }
        }
      } catch (error) {
        // 如果执行失败，继续其他检测
      }
    }

    // 2. 检查 CMakeLists.txt 是否存在
    const cmakeListsPath = path.join(dirPath, 'CMakeLists.txt');
    const hasCMakeLists = fs.existsSync(cmakeListsPath);

    // 3. 检查是否有 .asc 文件（根目录）
    const hasAscFiles = this.hasAscFiles(dirPath);

    // 4. 检查是否有 .py 文件（根目录，与 CMakeLists.txt 同级）
    const hasPyFiles = this.hasPyFiles(dirPath);

    // 5. 判断算子工程类型（按照优先级顺序）

    // <<<>>>算子工程默认模式：根目录存在 CMakeLists.txt 文件和 *.asc 文件
    if (hasCMakeLists && hasAscFiles && !hasPyFiles) {
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.ASCEND_C,
        projectPath: dirPath,
        projectName,
      };
    }

    // <<<>>>算子的 torch_library 算子工程：根目录存在 CMakeLists.txt 文件和 *.py 文件
    if (hasCMakeLists && hasPyFiles) {
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
      return {
        isOperatorProject: true,
        projectType: OperatorProjectType.PYASC,
        projectPath: dirPath,
        projectName,
      };
    }

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
      // 忽略错误
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
      // 忽略错误
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
    const results: OperatorProjectDetectionResult[] = [];

    await this.scanDirectory(rootPath, 0, maxDepth, results);

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
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      // 先检测当前目录是否为算子工程
      const detection = await this.detectOperatorProject(dirPath);
      if (detection.isOperatorProject) {
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
              continue;
            }

            const subDirPath = path.join(dirPath, entry.name);
            subDirs.push(subDirPath);
          }
        }

        for (const subDirPath of subDirs) {
          await this.scanDirectory(subDirPath, currentDepth + 1, maxDepth, results);
        }
      }
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 扫描 rootPath 目录下的第一层文件夹，查找标准自定义算子工程
   * 如果文件夹中的根目录有 CMakeLists.txt 的文件，则认为是算子工程
   * @param rootPath 根目录路径
   * @returns 检测到的算子工程列表
   */
  static async scanForStandardCustomOperatorProjects(rootPath: string): Promise<OperatorProjectDetectionResult[]> {
    const results: OperatorProjectDetectionResult[] = [];

    try {
      // 读取 rootPath 目录下的第一层文件夹
      const entries = fs.readdirSync(rootPath, { withFileTypes: true });

      for (const entry of entries) {
        // 只处理目录
        if (!entry.isDirectory()) {
          continue;
        }

        // 跳过隐藏目录和常见非算子工程目录
        const dirName = entry.name;

        if (
          dirName.startsWith('.')
          || dirName === 'node_modules'
          || dirName === 'out'
          || dirName === 'build'
        ) {
          continue;
        }

        // 检查文件夹根目录是否有 CMakeLists.txt 文件
        const folderPath = path.join(rootPath, entry.name);
        const cmakeListsPath = path.join(folderPath, 'CMakeLists.txt');

        if (fs.existsSync(cmakeListsPath)) {
          // 如果存在 CMakeLists.txt，则认为是算子工程
          const projectName = path.basename(folderPath);

          results.push({
            isOperatorProject: true,
            projectType: OperatorProjectType.STANDARD_CUSTOM,
            projectPath: folderPath,
            projectName,
          });
        }
      }
    }
    catch (error) {
      // 忽略错误，返回已收集的结果
    }

    return results;
  }
}
