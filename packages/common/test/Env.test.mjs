import { describe, expect, test } from '@jest/globals';
import { Env } from '..';
import { dirSync } from 'tmp';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

describe('Config utilities', () => {
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