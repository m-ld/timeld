import { join, sep } from 'path';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync
} from 'fs';
import env_paths from 'env-paths';

const envPaths = env_paths('timeld');

function getConfigFile(name = 'config') {
  return join(envPaths['config'], `${name}.json`);
}

export function readConfig(name = 'config', getDefault = () => {}) {
  const configFile = getConfigFile(name);
  return existsSync(configFile) ?
    JSON.parse(readFileSync(configFile, 'utf8')) : getDefault();
}

export function writeConfig(config, name = 'config') {
  mkdirSync(envPaths['config'], { recursive: true });
  writeFileSync(getConfigFile(name), JSON.stringify(config, null, ' '));
  return config;
}

export function isConfigKey(k) {
  return k !== '_' && k !== '$0';
}

export function mergeConfig(current, override) {
  if (override === false) {
    return undefined;
  } else if (override == null) {
    return current;
  } else if (Array.isArray(current) && Array.isArray(override)) {
    return [...current, ...override];
  } else if (typeof current == 'object' && typeof override == 'object') {
    const merged = {};
    for (let key of [...Object.keys(current), ...Object.keys(override)]) {
      if (!(key in merged) && isConfigKey(key))
        merged[key] = mergeConfig(current[key], override[key]);
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
export function readyEnvPath(key, path) {
  const orgDir = join(envPaths[key], ...path.slice(0, -1));
  mkdirSync(orgDir, { recursive: true });
  return join(orgDir, ...path.slice(-1));
}

/**
 * @param {keyof import('env-paths').Paths} key
 * @returns {string[][]}
 */
export function envDirs(key) {
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
  const envPath = envPaths[key];
  return [...subDirs(envPath)].map(dir => dir.slice(envPath.length + 1).split(sep));
}

/**
 * @param {keyof import('env-paths').Paths} key
 * @param {string[]} path
 * @param {boolean} [force]
 */
export function delEnvDir(key, path, { force } = {}) {
  const dir = join(envPaths[key], ...path);
  if (path.length > 0 && (force || readdirSync(dir).length === 0)) {
    if (force)
      rmSync(dir, { recursive: true, force: true });
    else
      rmdirSync(dir);
    // Tidy empty parent dirs
    delEnvDir(key, path.slice(0, -1));
  }
}

/**
 * @param {keyof import('env-paths').Paths} key
 * @param {string[]} path
 */
export function delEnvFile(key, path) {
  // Delete the given path, and then any empty parent folders
  rmSync(join(envPaths[key], ...path));
  delEnvDir(key, path.slice(0, -1));
}