// Type declarations for optional node-pty module
declare module "node-pty" {
  export interface IPty {
    pid: number;
    cols: number;
    rows: number;
    onData(callback: (data: string) => void): { dispose: () => void };
    onExit(callback: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: number): void;
  }

  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: { [key: string]: string };
  }

  export interface ITerminal {
    pid: number;
    cols: number;
    rows: number;
    onData(callback: (data: string) => void): { dispose: () => void };
    onExit(callback: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: number): void;
  }

  export function spawn(
    file: string,
    args: string[],
    options: IPtyForkOptions
  ): ITerminal;

  export default { spawn };
}
