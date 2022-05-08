import Cli from '../lib/Cli.mjs';
import Config from '../lib/Config.mjs';
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
    const config = new class extends Config {
      read = () => ({ test: 'Tested' });
    }();
    await new Cli(['config'], config, console).start();
    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String), expect.objectContaining({ test: 'Tested' }));
  });

  test('can set config', async () => {
    const mockWrite = jest.fn();
    const config = new class extends Config {
      read = () => ({ test: 'Tested' });
      write = mockWrite;
    }();
    await new Cli(['config', '--more', 'Written'], config, console).start();
    expect(logSpy).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(
      { test: 'Tested', more: 'Written' })
  });
});