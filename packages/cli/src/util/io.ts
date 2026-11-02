import * as FileSystemPromises from "fs/promises";

export interface AsyncFileReader {
  readTextFileAsync(path: string): Promise<string | undefined>;
}

export interface AsyncFileWriter {
  writeTextFileAsync(path: string, contents: string): Promise<void>;
}

class RealFileSystem implements AsyncFileReader, AsyncFileWriter {
  async readTextFileAsync(path: string): Promise<string | undefined> {
    try {
      return await FileSystemPromises.readFile(path, "utf-8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async writeTextFileAsync(path: string, contents: string): Promise<void> {
    await FileSystemPromises.writeFile(path, contents, "utf-8");
  }
}

export const REAL_FILE_SYSTEM = new RealFileSystem();

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await FileSystemPromises.lstat(path)).isDirectory();
  } catch (_e) {
    return false;
  }
}
