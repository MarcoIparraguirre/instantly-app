import fs from 'fs';
import path from 'path';

export interface IJsonStorageDriver {
  read<T>(filename: string, defaultValue: T): T;
  write<T>(filename: string, data: T): void;
}

export class JsonStorageDriver implements IJsonStorageDriver {
  private baseDir: string;

  constructor(baseDir: string = path.join(process.cwd(), 'data')) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch (err) {
        console.error(`Failed to create data directory at ${this.baseDir}:`, err);
      }
    }
  }

  private resolvePath(filename: string): string {
    return path.join(this.baseDir, filename);
  }

  read<T>(filename: string, defaultValue: T): T {
    const fullPath = this.resolvePath(filename);
    try {
      if (!fs.existsSync(fullPath)) {
        this.write(filename, defaultValue);
        return defaultValue;
      }
      const raw = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`Error reading ${fullPath}:`, err);
      return defaultValue;
    }
  }

  write<T>(filename: string, data: T): void {
    const fullPath = this.resolvePath(filename);
    try {
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error writing ${fullPath}:`, err);
    }
  }
}
