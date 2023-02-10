// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import { Cmd } from './Cmd.mjs';
import { findByText } from 'cli-testing-library';
import path from 'path';
import { readFileSync } from 'fs';
import { MalwareCloneFactory } from './MalwareCloneFactory.mjs';
import { setTimeout } from 'timers/promises';
import { timeldContext, TimeldPrincipal } from 'timeld-common';

jest.setTimeout(10000);

export class CliCmd extends Cmd {
  /**
   * @param {string} name
   */
  constructor(name) {
    super(name);
    this.name = name;
    this.dataDir = this.createDir();
    this.configDir = this.createDir();
  }

  run(...args) {
    return super.run(
      path.join(process.cwd(), 'packages', 'cli', 'index.mjs'),
      ...args, {
        spawnOpts: {
          env: {
            TIMELD_CLI_CONFIG_PATH: this.configDir,
            TIMELD_CLI_DATA_PATH: this.dataDir,
            LOG_LEVEL: 'debug'
          }
        }
      });
  }

  async configure() {
    await this.run('config',
      '--gateway', 'http://timeld.ex.org@localhost:8080',
      '--user', this.name);
    await this.waitForExit();
  }

  /**
   * Wait for next prompt and optionally type a command
   * @param [command] to type at the prompt
   */
  async nextPrompt(command) {
    await findByText(this.running, /\w+>[\s\n]*$/);
    if (command)
      this.type(command);
  }

  /**
   * Convenience to activate a CLI with a new user key
   * @param {Cmd} gw
   */
  async activate(gw) {
    await this.run('admin');
    await findByText(this.running, 'enter your email address');
    const email = `${this.name}@ex.org`;
    this.type(`${email}[Enter]`);
    let code = null;
    await findByText(gw.running, content => {
      [, code] = content.match(`ACTIVATION ${email} (\\d{6})`) ?? [];
      return code != null;
    });
    await findByText(this.running, 'enter the activation code');
    this.type(`${code}[Enter]`);
    await this.nextPrompt('exit[Enter]');
    await this.waitForExit();
  }
  /**
   * Convenience to get config
   */
  readConfig() {
    const configFilePath = path.join(this.configDir, 'config.json');
    return JSON.parse(/**@type string*/readFileSync(configFilePath, 'utf8'));
  }
}

describe('Gateway and CLI', () => {
  let /**@type Cmd*/gw;

  beforeAll(async () => {
    // Necessary for tests
    expect(process.env.CTL_SKIP_AUTO_CLEANUP).toBeTruthy();
    gw = new Cmd('gw');
    const dataDir = gw.createDir();
    await gw.run(
      path.join(process.cwd(), 'packages', 'gateway', 'server.mjs'),
      '--genesis', 'true', {
        spawnOpts: { env: { TIMELD_GATEWAY_DATA_PATH: dataDir } }
      });
    await findByText(gw.running, 'Gateway initialised');
  });

  describe('with one CLI', () => {
    let /**@type CliCmd*/aliceCli; // Created before all, exited after each

    beforeAll(async () => {
      aliceCli = new CliCmd('alice');
      await aliceCli.configure();
    });

    test('is configured', () => {
      expect(aliceCli.readConfig()).toEqual({
        gateway: 'http://timeld.ex.org@localhost:8080', user: 'alice'
      });
    });

    test('print config', async () => {
      await aliceCli.run('config');
      await findByText(aliceCli.running,
        'gateway: \'http://timeld.ex.org@localhost:8080\'');
    });

    test('activate with admin command', async () => {
      await aliceCli.activate(gw);
      expect(aliceCli.readConfig()).toMatchObject({
        gateway: 'http://timeld.ex.org@localhost:8080', user: 'alice',
        auth: { key: expect.any(String) },
        key: { public: expect.any(String), private: expect.any(String) }
      });
    });

    test('open timesheet add entry', async () => {
      await aliceCli.run('open', 'ts1');
      await aliceCli.nextPrompt('add testing[Enter]');
      await findByText(aliceCli.running, /"testing" \(alice, [\d\/,\s:APM]+\)/);
      aliceCli.type('exit[Enter]');
    });

    test('cannot connect without authentication', async () => {
      const config = { '@id': 'ivan', '@domain': 'ts1.alice.timeld.ex.org', genesis: false };
      await expect(Promise.race([
        new MalwareCloneFactory({
          address: 'http://localhost:8080'
        }).clone(config),
        // IO remotes will keep retrying, so time out the test
        setTimeout(1000, 'timed out')
      ])).resolves.toBe('timed out');
    });

    test('cannot connect without signed requests', async () => {
      const config = {
        '@id': 'ivan', '@domain': 'ts1.alice.timeld.ex.org', genesis: false,
        ...aliceCli.readConfig() // includes gateway address & authentication key
      };
      await expect(new MalwareCloneFactory().clone(config))
        .rejects.toThrow(/rejected/);
    });

    describe('with organisation-owned timesheet', () => {
      let /**@type TimeldCliConfig*/ivanConfig;

      beforeAll(async () => {
        // Register Ivan to get keys (he won't use the CLI again)
        const ivanCli = new CliCmd('ivan');
        await ivanCli.configure();
        await ivanCli.activate(gw);
        ivanConfig = ivanCli.readConfig();
        // Register the testers organisation
        await aliceCli.run('admin');
        await aliceCli.nextPrompt('add org testers[Enter]');
        await aliceCli.nextPrompt('exit[Enter]');
        await aliceCli.waitForExit();
        // Admin the testers account to add ivan
        await aliceCli.run(
          'admin', '--account', 'testers');
        await aliceCli.nextPrompt('add admin ivan[Enter]');
        await aliceCli.nextPrompt('exit[Enter]');
        await aliceCli.waitForExit();
        // Add a new testers timesheet
        await aliceCli.run('open', 'testers/ts2');
        await aliceCli.nextPrompt('add "alice testing"[Enter]');
        await aliceCli.nextPrompt('exit[Enter]');
        await aliceCli.waitForExit();
        // Ivan needs to join the timesheet at least once to register himself
        await ivanCli.run('open', 'testers/ts2');
        await ivanCli.nextPrompt('exit[Enter]');
        await ivanCli.cleanup();
      });

      test('ignores an attacker updating another user\'s entry', async () => {
        await aliceCli.run('open', 'testers/ts2');
        const config = {
          '@id': 'ivan', '@domain': 'ts2.testers.timeld.ex.org', genesis: false,
          '@context': timeldContext, ...ivanConfig
        };
        const ivanClone = await new MalwareCloneFactory({
          disablePermissions: true
        }).clone(config, null,
          new TimeldPrincipal('http://timeld.ex.org/ivan', ivanConfig));
        await ivanClone.status.becomes({ outdated: false });
        await expect(ivanClone.ask({
          '@where': { activity: 'alice testing' }
        })).resolves.toBe(true);
        await ivanClone.write({
          '@delete': {
            '@id': '?', '?': '?',
            'vf:provider': { '@id': 'http://timeld.ex.org/alice' }
          }
        });
        await expect(ivanClone.ask({
          '@where': { activity: 'alice testing' }
        })).resolves.toBe(false);
        // check that Alice still has her entry
        await aliceCli.nextPrompt('ls[Enter]');
        await findByText(aliceCli.running, 'alice testing');
        await aliceCli.nextPrompt('exit[Enter]');
        await aliceCli.waitForExit();
      });

      test.todo('ignores an attacker changing timesheet admins');

      test.todo('voids an entry concurrent with user revocation');

    });

    afterEach(() => aliceCli?.waitForExit());

    afterAll(() => aliceCli.cleanup());
  });

  afterAll(() => gw.cleanup());
});