declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  export default function SQLiteESMFactory(config?: { locateFile?: (file: string) => string }): Promise<unknown>;
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(name: string);
  }
}

declare module 'wa-sqlite' {
  export interface SQLiteAPI {
    exec(db: number, sql: string, callback?: (row: unknown[]) => void): Promise<void>;
    run(db: number, sql: string, params: unknown[] | null): Promise<void>;
    execWithParams(db: number, sql: string, params: unknown[] | null): Promise<{
      columns: string[];
      rows: unknown[][];
    }>;
    open_v2(filename: string): Promise<number>;
    vfs_register(vfs: unknown, makeDefault: boolean): void;
  }
  export function Factory(module: unknown): SQLiteAPI;
}
