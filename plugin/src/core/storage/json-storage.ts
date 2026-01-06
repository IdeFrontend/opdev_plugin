import * as fs from 'fs-extra';
import * as path from 'path';

export class JsonStorage {
  constructor(private filePath: string) {}

  public read<T>(defaultValue: T): T {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.write(defaultValue);

        return defaultValue;
      }

      const content = fs.readFileSync(this.filePath, 'utf-8');

      return JSON.parse(content) as T;
    }
    catch (error) {
      console.error(`Failed to read storage file: ${this.filePath}`, error);

      // 备份损坏的文件
      if (fs.existsSync(this.filePath)) {
        try {
          fs.copySync(this.filePath, `${this.filePath}.bak`);
        }
        catch {
          // empty
        }
      }

      this.write(defaultValue);

      return defaultValue;
    }
  }

  public write<T>(data: T): void {
    try {
      fs.ensureDirSync(path.dirname(this.filePath));
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (error) {
      console.error(`Failed to write storage file: ${this.filePath}`, error);
      throw error;
    }
  }

  public delete(): void {
    if (fs.existsSync(this.filePath)) {
      fs.removeSync(this.filePath);
    }
  }
}
