import type { ScannedFile } from "../services/scanner.js";

/**
 * Plugin interface - plugins transform files before notification
 */
export interface DocoraPlugin {
  /** Unique plugin name */
  name: string;

  /** Plugin version */
  version: string;

  /**
   * Transform files - receives all files, returns modified set
   * Can modify content, add files, remove files, etc.
   */
  transform(files: ScannedFile[]): Promise<ScannedFile[]>;
}

/**
 * Plugin pipeline - executes plugins in order
 */
export class PluginPipeline {
  private plugins: DocoraPlugin[] = [];

  /**
   * Register a plugin to the pipeline
   */
  register(plugin: DocoraPlugin): void {
    this.plugins.push(plugin);
    console.log(`Registered plugin: ${plugin.name}@${plugin.version}`);
  }

  /**
   * Execute all plugins in order
   * For now, this is a passthrough (no plugins registered)
   */
  async execute(files: ScannedFile[]): Promise<ScannedFile[]> {
    let processedFiles = files;

    for (const plugin of this.plugins) {
      console.log(`Executing plugin: ${plugin.name}`);
      try {
        processedFiles = await plugin.transform(processedFiles);
      } catch (err) {
        console.error(`Plugin ${plugin.name} failed:`, err);
        throw err;
      }
    }

    return processedFiles;
  }

  /**
   * Get count of registered plugins
   */
  get pluginCount(): number {
    return this.plugins.length;
  }
}

/**
 * Default pipeline instance (no plugins)
 */
export const defaultPipeline = new PluginPipeline();
