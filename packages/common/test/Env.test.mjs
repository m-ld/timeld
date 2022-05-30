import { describe, expect, test } from '@jest/globals';
import { Env } from '..';
import { dirSync } from 'tmp';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

describe('Environment', () => {
  describe('arguments', () => {
    test('constructs with default env', () => {
      expect(new Env().envPaths.env).toBe('TIMELD');
    });

    test('constructs with no env', () => {
      expect(new Env({ env: false }).envPaths.env).toBeUndefined();
    });

    test('grabs a variable from process env', async () => {
      process.env.TIMELD_TEST = 'Test';
      const args = (await new Env().yargs()).parse();
      expect(args['test']).toBe('Test');
    });
  });

  describe('config files', () => {
    let tmpDir;

    beforeEach(() => {
      // noinspection JSCheckFunctionSignatures
      tmpDir = dirSync({ unsafeCleanup: true });
    });

    afterEach(async () => {
      tmpDir.removeCallback();
    });

    test('default config dir from env-paths module', async () => {
      const env = new Env();
      expect(env.envPaths.config).toMatch(/\/timeld-nodejs/);
    });

    test('undefined does not override config dir', async () => {
      const env = new Env({ config: undefined });
      expect(env.envPaths.config).toMatch(/\/timeld-nodejs/);
    });

    test('override config dir', async () => {
      const env = new Env({ config: tmpDir.name });
      expect(env.envPaths.config).toBe(tmpDir.name);
    });

    test('read missing config as empty', async () => {
      const env = new Env({ config: tmpDir.name });
      await expect(env.readConfig()).resolves.toEqual({});
    });

    test('can write config', async () => {
      const env = new Env({ config: tmpDir.name });
      await env.writeConfig({ foo: true });
      await expect(env.readConfig()).resolves.toEqual({ foo: true });
    });

    test('can update config', async () => {
      const env = new Env({ config: tmpDir.name });
      await env.writeConfig({ foo: true });
      await env.updateConfig({ foo: 'bar' });
      await expect(env.readConfig()).resolves.toEqual({ foo: 'bar' });
    });
  });

  describe('config merging', () => {
    test('atoms', () => {
      expect(Env.mergeConfig({}, {})).toEqual({});
      expect(Env.mergeConfig({}, undefined)).toEqual({});
      expect(Env.mergeConfig(1, 2)).toBe(2);
      // false removes config item
      expect(Env.mergeConfig(1, false)).toBeUndefined();
      expect(Env.mergeConfig(null, 1)).toBe(1);
    });

    test('deep', () => {
      expect(Env.mergeConfig({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
      expect(Env.mergeConfig({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      expect(Env.mergeConfig({ a: 1 }, { a: false })).toEqual({});
      expect(Env.mergeConfig({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
      expect(Env.mergeConfig({ '@id': 'uuid' }, { '@id': false })).toEqual({});
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: false })).toEqual({});
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: { b: false } })).toEqual({ a: {} });
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
    });

    test('varargs', () => {
      expect(Env.mergeConfig({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
      expect(Env.mergeConfig({ a: 1 }, { a: false }, { a: 2 })).toEqual({ a: 2 });
    });

    test('ignores non-config', () => {
      expect(Env.mergeConfig({ a: 1 }, { '_': 2 })).toEqual({ a: 1 });
      expect(Env.mergeConfig({ a: 1 }, { '$0': 2 })).toEqual({ a: 1 });
    });
  });

  describe('directories', () => {
    let tmpDir;
    let env;

    beforeEach(() => {
      // noinspection JSCheckFunctionSignatures
      tmpDir = dirSync({ unsafeCleanup: true });
      env = new Env({ data: tmpDir.name });
    });

    afterEach(async () => {
      tmpDir.removeCallback();
    });

    test('no env dirs', async () => {
      await expect(env.envDirs('data')).resolves.toEqual([]);
    });

    test('ready env path', async () => {
      await expect(env.readyPath('data', 'a', 'b'))
        .resolves.toBe(join(tmpDir.name, 'a', 'b'));
      expect(existsSync(join(tmpDir.name, 'a'))).toBe(true);
      await expect(env.envDirs('data')).resolves.toEqual([['a']]);
    });

    test('env dirs are leafs', async () => {
      await mkdir(join(tmpDir.name, 'a', 'b'), { recursive: true });
      await mkdir(join(tmpDir.name, 'a', 'c'), { recursive: true });
      await expect(env.envDirs('data')).resolves.toEqual([
        ['a', 'b'],
        ['a', 'c']
      ]);
    });

    test('del env dir', async () => {
      await mkdir(join(tmpDir.name, 'a', 'b'), { recursive: true });
      await mkdir(join(tmpDir.name, 'a', 'c'), { recursive: true });
      await env.delEnvDir('data', ['a', 'c']);
      await expect(env.envDirs('data')).resolves.toEqual([
        ['a', 'b']
      ]);
      await env.delEnvDir('data', ['a'], { force: true });
      await expect(env.envDirs('data')).resolves.toEqual([]);
    });
  });
});