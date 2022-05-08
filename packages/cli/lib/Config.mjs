import { join, sep } from 'path';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync
} from 'fs';
import env_paths from 'env-paths';

export default class Config {
  constructor(envPaths = env_paths('timeld')) {
    this.envPaths = envPaths;
  }

  /**
   * @param {string} name config file name to read from the config directory
   * @param {() => object} getDefault
   * @returns {object}
   */
  read(name = 'config', getDefault = () => ({})) {
    const configFile = this.getFile(name);
    return existsSync(configFile) ?
      JSON.parse(readFileSync(configFile, 'utf8')) : getDefault();
  }

  /**
   * @param {object} config
   * @param {string} name config file name to read from the config directory
   * @returns {object} config parameter
   */
  write(config, name = 'config') {
    mkdirSync(this.envPaths['config'], { recursive: true });
    writeFileSync(this.getFile(name), JSON.stringify(config, null, ' '));
    return config;
  }

  static isConfigKey(k) {
    return k !== '_' && k !== '$0';
  }

  merge(current, override) {
    if (override === false) {
      return undefined;
    } else if (override == null) {
      return current;
    } else if (Array.isArray(current) && Array.isArray(override)) {
      return [...current, ...override];
    } else if (typeof current == 'object' && typeof override == 'object') {
      const merged = {};
      for (let key of [...Object.keys(current), ...Object.keys(override)]) {
        if (!(key in merged) && Config.isConfigKey(key))
          merged[key] = this.merge(current[key], override[key]);
      }
      return merged;
    } else {
      return override;
    }
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @param {string[]} path
   */
  readyEnvPath(key, path) {
    const orgDir = join(this.envPaths[key], ...path.slice(0, -1));
    mkdirSync(orgDir, { recursive: true });
    return join(orgDir, ...path.slice(-1));
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @returns {string[][]}
   */
  envDirs(key) {
    function *subDirs(dir) {
      for (let dirEnt of readdirSync(dir, { withFileTypes: true })) {
        if (dirEnt.isDirectory()) {
          const dirPath = join(dir, dirEnt.name);
          let anySubDirs = false;
          for (let subDir of subDirs(dirPath)) {
            yield subDir;
            anySubDirs = true;
          }
          if (!anySubDirs)
            yield dirPath;
        }
      }
    }
    const envPath = this.envPaths[key];
    return !existsSync(envPath) ? [] :
      [...subDirs(envPath)].map(dir => dir.slice(envPath.length + 1).split(sep));
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @param {string[]} path
   * @param {boolean} [force]
   */
  delEnvDir(key, path, { force } = {}) {
    const dir = join(this.envPaths[key], ...path);
    if (path.length > 0 && (force || readdirSync(dir).length === 0)) {
      if (force)
        rmSync(dir, { recursive: true, force: true });
      else
        rmdirSync(dir);
      // Tidy empty parent dirs
      this.delEnvDir(key, path.slice(0, -1));
    }
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @param {string[]} path
   */
  delEnvFile(key, path) {
    // Delete the given path, and then any empty parent folders
    rmSync(join(this.envPaths[key], ...path));
    this.delEnvDir(key, path.slice(0, -1));
  }

  /** @private */
  getFile(name = 'config') {
    return join(this.envPaths['config'], `${name}.json`);
  }
}
