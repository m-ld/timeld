import Cli from '../lib/Cli.mjs';
import { Env } from 'timeld-common';
import { describe, expect, jest, test } from '@jest/globals';

describe('CLI', () => {
  let console;
  let logSpy;

  beforeEach(() => {
    console = new global.console.Console(process.stdout);
    // noinspection JSCheckFunctionSignatures
    logSpy = jest.spyOn(console, 'log');
  });

  test('can inspect config', async () => {
    const env = new class extends Env {
      readConfig = async () => ({ test: 'Tested' });
    }();
    await new Cli({
      args: ['config'], env, console
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
    await new Cli({
      args: ['config', '--more', 'Written'], env, console
    }).start();
    expect(logSpy).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(
      { test: 'Tested', more: 'Written' })
  });
});