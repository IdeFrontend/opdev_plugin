/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { ZlibOptions } from 'zlib'


export default class DirectoryZipper {
    public currentDir: string;

    constructor(startingDir?: string) {
        this.currentDir = startingDir ? path.resolve(startingDir) : process.cwd();
    }

    /**
     * 查找以指定前缀开头的目录
     */
    private findDirectoryByPrefix(prefix: string): string | null {
        let currentPath = this.currentDir;

        while (currentPath !== path.parse(currentPath).root) {
            const parentPath = path.dirname(currentPath);
            console.log(`查找目录：parentPath=${parentPath}  currentPath=${currentPath}`);

            try {
                const items = fs.readdirSync(parentPath, { withFileTypes: true });

                for (const item of items) {
                    if (item.isDirectory() && item.name.startsWith(prefix)) {
                        return path.join(parentPath, item.name);
                    }
                }
            } catch (error) {
                console.warn(`无法读取目录 ${parentPath}: ${error}`);
            }

            currentPath = parentPath;
        }

        return null;
    }

    /**
     * 创建ZIP压缩文件 - 修复版本
     */
    private async createZip(sourceDir: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // 修复：使用类型安全的创建方式
            const archive = archiver.create('zip', {
                zlib: { level: 9 } as ZlibOptions // 添加类型断言
            });

            const output = fs.createWriteStream(outputPath);

            output.on('close', () => {
                console.log(`压缩完成! 文件大小: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
                resolve();
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    }


    /**
     * 主方法：查找目录并压缩
     */
    public async findAndZipDirectory(directoryPrefix: string, zipFileName?: string): Promise<string> {
        try {
            console.log(`正在查找以 "${directoryPrefix}" 开头的目录.`);

            const targetDir = this.findDirectoryByPrefix(directoryPrefix);

            console.log(`查找结果： ${targetDir}`);

            if (!targetDir) {
                console.error(`未找到以 "${directoryPrefix}" 开头的目录`);
                return '';
            }

            console.log(`找到目录: ${targetDir}`);

            const dirName = path.basename(targetDir);
            const outputFileName = zipFileName || `${dirName}.zip`;
            const outputPath = path.join(path.dirname(targetDir), outputFileName);

            console.log(`开始压缩目录到: ${outputPath}`);

            if (fs.existsSync(outputPath)) {
                console.warn(`输出文件已存在，将被覆盖: ${outputPath}`);
                fs.unlinkSync(outputPath);
            }

            await this.createZip(targetDir, outputPath);

            console.log(`成功将目录 ${targetDir} 压缩到 ${outputPath}`);
            return `${path.dirname(targetDir)}/`;

        } catch (error) {
            console.error('压缩过程中发生错误:', error);
            return '';
        }
    }

    public setCurrentDirectory(dir: string): void {
        this.currentDir = path.resolve(dir);
    }

    public getCurrentDirectory(): string {
        return this.currentDir;
    }
}