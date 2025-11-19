/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

declare module 'archiver' {
    interface ZlibOptions {
        level?: number;
    }

    interface ArchiverOptions {
        zlib?: ZlibOptions;
    }

    class Archiver {
        pipe(stream: NodeJS.WritableStream): void;
        directory(dirpath: string, options?: boolean | { name?: string }): this;
        finalize(): void;
        on(event: 'error', callback: (error: Error) => void): this;
        on(event: 'close', callback: () => void): this;
        pointer(): number;
    }

    function create(format: string, options?: ArchiverOptions): Archiver;

    export { Archiver, ArchiverOptions, ZlibOptions, create };
}

export default class DirectoryZipper {
    private currentDir: string;

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
                zlib: { level: 9 } as archiver.ZlibOptions // 添加类型断言
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
     * 替代方案：使用更简洁的创建方式
     */
    private async createZipAlternative(sourceDir: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // 方法：直接创建 Archiver 实例
            const archive = archiver.create('zip', {
                zlib: { level: 9 }
            });

            const output = fs.createWriteStream(outputPath);

            output.on('close', resolve);
            archive.on('error', reject);

            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    }

    /**
     * 主方法：查找目录并压缩
     */
    public async findAndZipDirectory(directoryPrefix: string, zipFileName?: string): Promise<boolean> {
        try {
            console.log(`正在查找以 "${directoryPrefix}" 开头的目录...`);

            const targetDir = this.findDirectoryByPrefix(directoryPrefix);

            if (!targetDir) {
                console.error(`未找到以 "${directoryPrefix}" 开头的目录`);
                return false;
            }

            console.log(`找到目录: ${targetDir}`);

            const dirName = path.basename(targetDir);
            const outputFileName = zipFileName || `${dirName}.zip`;
            const outputPath = path.join(this.currentDir, outputFileName);

            console.log(`开始压缩目录到: ${outputPath}`);

            if (fs.existsSync(outputPath)) {
                console.warn(`输出文件已存在，将被覆盖: ${outputPath}`);
                fs.unlinkSync(outputPath);
            }

            await this.createZip(targetDir, outputPath);

            console.log(`成功将目录 ${targetDir} 压缩到 ${outputPath}`);
            return true;

        } catch (error) {
            console.error('压缩过程中发生错误:', error);
            return false;
        }
    }

    public setCurrentDirectory(dir: string): void {
        this.currentDir = path.resolve(dir);
    }

    public getCurrentDirectory(): string {
        return this.currentDir;
    }
}