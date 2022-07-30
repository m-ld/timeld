import Cli from '../lib/Cli.mjs';
import { Env } from 'timeld-common';
import { describe, expect, jest, test } from '@jest/globals';
import { createWriteStream } from 'fs';

describe('CLI', () => {
  let console;
  let logSpy;

  beforeEach(() => {
    console = new global.console.Console(createWriteStream('/dev/null'));
    // noinspection JSCheckFunctionSignatures
    logSpy = jest.spyOn(console, 'log');
  });

  test('open validates user option', async () => {
    const env = new class extends Env {
      // User should not include special chars
      readConfig = async () => ({ user: 'user@m-ld.org', account: 'user' });
    }();
    let cli = new class extends Cli {
      addOptions(argv) {
        return super.addOptions(argv).exitProcess(false);
      }
    }(env, { args: ['open', 'ts1'], console });
    cli.openCmd = jest.fn();
    await expect(cli.start()).rejects.toMatch(/user@m-ld\.org/);
  });

  test('admin validates user option', async () => {
    const env = new class extends Env {
      // User should not include special chars
      readConfig = async () => ({
        user: 'user@m-ld.org', // User should not include special chars
        account: 'user', gateway: 'timeld.org'
      });
    }();
    let cli = new class extends Cli {
      addOptions(argv) {
        return super.addOptions(argv).exitProcess(false);
      }
    }(env, { args: ['admin'], console });
    cli.adminCmd = jest.fn();
    await expect(cli.start()).rejects.toMatch(/user@m-ld\.org/);
  });

  test('can inspect config', async () => {
    const env = new class extends Env {
      readConfig = async () => ({ test: 'Tested' });
    }();
    await new Cli(env, {
      args: ['config'], console
    }).start();
    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String), expect.objectContaining({ test: 'Tested' }));
  });

  test('can set config', async () => {
    const mockWrite = jest.fn();
    const env = new class extends Env {
      readConfig = async () => ({ test: 'Tested' });
      writeConfig = mockWrite;
    }();
    await new Cli(env, {
      args: ['config', '--more', 'Written'], console
    }).start();
    expect(logSpy).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(
      { test: 'Tested', more: 'Written' });
  });

  test('sets config using un-abbreviated keys', async () => {
    const mockWrite = jest.fn();
    const env = new class extends Env {
      readConfig = async () => ({ test: 'Tested' });
      writeConfig = mockWrite;
    }();
    await new Cli(env, {
      args: ['config', '--acc', 'my-account'], console
    }).start();
    expect(logSpy).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(
      { test: 'Tested', account: 'my-account' });
  });
});