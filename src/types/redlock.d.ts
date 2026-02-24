/**
 * Type declaration for redlock v5 beta.
 *
 * The package ships its own d.ts but its package.json "exports" field
 * does not include a "types" entry, so NodeNext module resolution
 * cannot find it. This ambient declaration re-exports the shapes we use.
 */
declare module "redlock" {
  import { Redis } from "ioredis";
  import { EventEmitter } from "events";

  type Client = Redis;

  interface Settings {
    readonly driftFactor: number;
    readonly retryCount: number;
    readonly retryDelay: number;
    readonly retryJitter: number;
    readonly automaticExtensionThreshold: number;
  }

  class ResourceLockedError extends Error {
    constructor(message: string);
  }

  class ExecutionError extends Error {
    readonly attempts: ReadonlyArray<unknown>;
    constructor(message: string, attempts: ReadonlyArray<unknown>);
  }

  class Lock {
    release(): Promise<unknown>;
    extend(duration: number): Promise<Lock>;
  }

  export default class Redlock extends EventEmitter {
    constructor(
      clients: Iterable<Client>,
      settings?: Partial<Settings>
    );
    acquire(
      resources: string[],
      duration: number,
      settings?: Partial<Settings>
    ): Promise<Lock>;
    release(lock: Lock): Promise<unknown>;
    quit(): Promise<void>;
  }

  export { ExecutionError, ResourceLockedError, Lock, Settings, Client };
}
