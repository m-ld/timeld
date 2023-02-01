// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import { CliCmd, Cmd } from './Cmd.mjs';
import { findByText } from 'cli-testing-library';
import path from 'path';
import { readFileSync } from 'fs';

jest.setTimeout(20000);

describe('Gateway and CLI', () => {
  let /**@type Cmd*/gw;

  beforeAll(async () => {
    // Necessary for tests
    expect(process.env.CTL_SKIP_AUTO_CLEANUP).toBeTruthy();
    gw = new Cmd('gw');
    const dataDir = gw.createDir();
    await gw.run([
      path.join(process.cwd(), 'packages', 'gateway', 'server.mjs'),
      '--genesis', 'true'
    ], {
      spawnOpts: { env: { TIMELD_GATEWAY_DATA_PATH: dataDir } }
    });
    await findByText(gw.running, 'Gateway initialised');
  });

  describe('with one CLI', () => {
    let /**@type CliCmd*/configCmd;

    beforeAll(async () => {
      configCmd = new CliCmd();
      await configCmd.run([
        'config',
        '--gateway', 'http://timeld.ex.org@localhost:8080',
        '--user', 'test'
      ]);
      await expect(configCmd.waitForExit()).resolves.not.toThrow();
    });

    test('is configured', () => {
      expect(JSON.parse(readFileSync(path.join(configCmd.configDir, 'config.json'), 'utf8')))
        .toEqual({ gateway: 'http://timeld.ex.org@localhost:8080', user: 'test' });
    });

    test('print config', async () => {
      let printConfig = new CliCmd(configCmd);
      await printConfig.run(['config']);
      await findByText(printConfig.running,
        'gateway: \'http://timeld.ex.org@localhost:8080\'');
      await expect(printConfig.waitForExit()).resolves.not.toThrow();
    });

    test('activate with admin command', async () => {
      let adminCmd = new CliCmd(configCmd);
      await adminCmd.run(['admin']);
      await findByText(adminCmd.running, 'enter your email address');
      adminCmd.keyboard('test@ex.org[Enter]');
      let code = null;
      await findByText(gw.running, content => {
        [, code] = content.match(/ACTIVATION test@ex.org (\d{6})/);
        return code != null;
      });
      await findByText(adminCmd.running, 'enter the activation code');
      adminCmd.keyboard(`${code}[Enter]`);
      await findByText(adminCmd.running, 'test>');
      adminCmd.keyboard('exit[Enter]');
      await adminCmd.waitForExit();
    });

    afterAll(() => configCmd.cleanup());
  });

  afterAll(() => gw.cleanup());
});