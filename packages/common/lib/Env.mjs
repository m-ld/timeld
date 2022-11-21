import { join, sep } from 'path';
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'fs/promises';
import env_paths from 'env-paths';
import createYargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';

// [Development] Pull variables from .env file into process.env
dotenv.config();

export default class Env {
  /**
   * The optional `envPath` parameter provides paths for local data, config,
   * logs etc. The additional `env` key provides the prefix into yargs.env – if
   * `false`, no environment variables will be read.
   *
   * The optional `appName` parameter drives the default paths determination,
   * according to the `env-paths` module; and also the default prefix for
   * environment variables.
   *
   * @param {Partial<import('env-paths').Paths & { env: string | false }>} [envPaths]
   * @param {string} [appName]
   * @see https://github.com/sindresorhus/env-paths#api
   * @see https://yargs.js.org/docs/#api-reference-envprefix
   */
  constructor(envPaths = {}, appName = 'timeld') {
    this.envPaths = Env.mergeConfig(
      { env: Env.toEnvVar(appName) }, env_paths(appName), envPaths);
  }

  /**
   * @param {string} name
   * @returns {string} uppercase snake-case
   */
  static toEnvVar(name) {
    return name
      // Non-word characters (including hyphens) with underscores
      .replace(/\W+/g, '_')
      // Camel case to snake case
      .replace(/([A-Z])/g, '_$&')
      .toUpperCase();
  }

  /**
   * Loads environment variables from any .env file up to three directories up
   */
  static initScript() {
    for (let i = 0; i < 3; i++) {
      if (!dotenv.config({
        path: join(process.cwd(), ...new Array(i).fill('..'), '.env')
      }).error) break;
    }
  }

  get envPrefix() {
    return this.envPaths.env ? `${this.envPaths.env}_` : '';
  }

  /**
   * @returns the config as an object containing environment variables, e.g. {
   *   TIMELD_GATEWAY_KEY1: 'key1',
   *   TIMELD_GATEWAY_NESTED__KEY2: 'key2',
   * }
   * @param {object} config
   * @param {string[]} filter if non-empty, the keys to include
   * @param {object} env existing env to add to
   * @param {string} prefix prefix for new entries
   */
  asEnv(
    config,
    filter = [],
    env = {},
    prefix = this.envPrefix
  ) {
    for (let [key, value] of Object.entries(config)) {
      if (value != null && (filter.length === 0 || filter.includes(key))) {
        const envVar = `${prefix}${Env.toEnvVar(key)}`;
        if (typeof value == 'object')
          this.asEnv(value, [], env, `${envVar}__`);
        else
          env[envVar] = `${value}`;
      }
    }
    return env;
  }

  /**
   * @returns {yargs.Argv<{}>}
   */
  baseYargs(args = hideBin(process.argv)) {
    // noinspection SpellCheckingInspection
    return createYargs(args)
      .updateStrings({ 'Positionals:': 'Details:' })
      .parserConfiguration({ 'strip-dashed': true, 'strip-aliased': true });
  }

  /**
   * @returns {yargs.Argv<{}>}
   */
  async yargs(args = hideBin(process.argv)) {
    return this.baseYargs(args)
      .env(this.envPaths.env || false)
      .config(await this.readConfig())
      .option('logLevel', { default: process.env.LOG_LEVEL });
  }

  /**
   * Gets the path of a file or directory under an environment key.
   * Ensures that the parent directory exists.
   * @param {keyof import('env-paths').Paths} key
   * @param {string} path
   */
  async readyPath(key, ...path) {
    if (path.length === 0)
      throw new RangeError('Path must contain an entry');
    const parentDir = join(this.envPaths[key], ...path.slice(0, -1));
    await mkdir(parentDir, { recursive: true });
    return join(parentDir, ...path.slice(-1));
  }

  /**
   * @returns {Promise<object>}
   */
  async readConfig() {
    // Not creating anything here
    const configFile = join(this.envPaths['config'], 'config.json');
    try {
      return JSON.parse(await readFile(configFile, 'utf8'));
    } catch (err) {
      return this.defaultIfNotExists(err, {});
    }
  }

  /**
   * @param {object} config
   * @returns {Promise<object>} config parameter
   */
  async writeConfig(config) {
    const path = await this.readyPath('config', 'config.json');
    await writeFile(path, JSON.stringify(config, null, ' '));
    return config;
  }

  /**
   * @param {object} configs
   * @returns {Promise<object>} final config written
   */
  async updateConfig(...configs) {
    return this.writeConfig(Env.mergeConfig(await this.readConfig(), ...configs));
  }

  static isConfigKey(k) {
    return k !== '_' && k !== '$0';
  }

  /**
   * @param {*} current
   * @param {*} override
   * @param {*} more
   * @returns {*}
   */
  static mergeConfig(current, override, ...more) {
    const merged = (function () {
      if (override === false) {
        return undefined;
      } else if (override == null) {
        return current;
      } else if (Array.isArray(current) && Array.isArray(override)) {
        return [...current, ...override];
      } else if (typeof current == 'object' && typeof override == 'object') {
        const merged = {};
        for (let key of [...Object.keys(current), ...Object.keys(override)]) {
          if (!(key in merged) && Env.isConfigKey(key))
            merged[key] = Env.mergeConfig(current[key], override[key]);
        }
        return merged;
      } else {
        return override;
      }
    })();
    return more.length > 0 ? Env.mergeConfig(merged, ...more) : merged;
  }

  /**
   * List the sub-paths, having no child directories, under the given key.
   *
   * @param {keyof import('env-paths').Paths} key
   * @returns {Promise<string[][]>} leaf sub-paths
   */
  async envDirs(key) {
    async function *subDirs(dir) {
      for (let dirEnt of await readdir(dir, { withFileTypes: true })) {
        if (dirEnt.isDirectory()) {
          const dirPath = join(dir, dirEnt.name);
          let anySubDirs = false;
          for await (let subDir of subDirs(dirPath)) {
            yield subDir;
            anySubDirs = true;
          }
          if (!anySubDirs)
            yield dirPath;
        }
      }
    }
    try {
      const envPath = this.envPaths[key];
      const envDirs = [];
      for await (let dir of subDirs(envPath))
        envDirs.push(dir.slice(envPath.length + 1).split(sep));
      return envDirs;
    } catch (err) {
      return this.defaultIfNotExists(err, []);
    }
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @param {string[]} path
   * @param {boolean} [force]
   */
  async delEnvDir(key, path, { force } = {}) {
    const dir = join(this.envPaths[key], ...path);
    if (path.length > 0 && (force || (await readdir(dir)).length === 0)) {
      if (force)
        await rm(dir, { recursive: true, force: true });
      else
        await rmdir(dir);
      // Tidy empty parent dirs
      await this.delEnvDir(key, path.slice(0, -1));
    }
  }

  /**
   * @param {keyof import('env-paths').Paths} key
   * @param {string[]} path
   */
  async delEnvFile(key, path) {
    // Delete the given path, and then any empty parent folders
    await rm(join(this.envPaths[key], ...path));
    await this.delEnvDir(key, path.slice(0, -1));
  }

  defaultIfNotExists(err, defaultValue) {
    if (err.code === 'ENOENT') {
      return defaultValue;
    } else {
      throw err;
    }
  }
}
