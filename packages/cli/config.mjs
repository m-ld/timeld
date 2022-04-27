import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import env_paths from 'env-paths';

export const envPaths = env_paths('timeld');

function getConfigFile() {
  return join(envPaths['config'], 'config.json');
}

export function readConfig() {
  const configFile = getConfigFile();
  return existsSync(configFile) ?
    JSON.parse(readFileSync(configFile, 'utf8')) : {};
}

export function writeConfig(config) {
  mkdirSync(envPaths['config'], { recursive: true });
  writeFileSync(getConfigFile(), JSON.stringify(config, null, ' '));
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