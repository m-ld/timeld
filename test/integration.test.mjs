// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import { MalwareCloneFactory } from './MalwareCloneFactory.mjs';
import { setTimeout } from 'timers/promises';
import { timeldContext, TimeldPrincipal } from 'timeld-common';
import CliCmd from './CliCmd.mjs';
import GwCmd from './GwCmd.mjs';

jest.setTimeout(10000);

describe('Gateway and CLI', () => {
  let /**@type GwCmd*/gw;
  let /**@type CliCmd*/aliceCli; // Created before all, exited after each

  beforeAll(async () => {
    // Necessary for tests
    expect(process.env.CTL_SKIP_AUTO_CLEANUP).toBeTruthy();
    process.env.DEBUG_PRINT_LIMIT = 'Infinity';
  });

  beforeAll(async () => {
    gw = new GwCmd();
    await gw.start();
    // Create Alice's CLI
    aliceCli = new CliCmd('alice');
    await aliceCli.configure();
  });

  afterEach(() => aliceCli?.waitForExit());

  afterAll(async () => {
    await aliceCli.cleanup();
    await gw.cleanup();
  });

  test('is configured', () => {
    expect(aliceCli.readConfig()).toEqual({
      gateway: 'http://timeld.ex.org@localhost:8080', user: 'alice'
    });
  });

  test('print config', async () => {
    await aliceCli.run('config');
    await aliceCli.findByText('gateway: \'http://timeld.ex.org@localhost:8080\'');
  });

  describe('with activated CLI', () => {
    beforeAll(async () => {
      await aliceCli.activate(gw);
    });

    test('has keys in config', async () => {
      expect(aliceCli.readConfig()).toMatchObject({
        gateway: 'http://timeld.ex.org@localhost:8080', user: 'alice',
        auth: { key: expect.any(String) },
        key: { public: expect.any(String), private: expect.any(String) }
      });
    });

    test('open timesheet add entry', async () => {
      await aliceCli.run('open', 'ts1');
      await aliceCli.nextPrompt('add testing');
      await aliceCli.findByText(/"testing" \(alice, [\d\/,\s:APM]+\)/);
      aliceCli.type('exit');
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
      let /**@type CliCmd*/ivanCli;
      let /**@type TimeldConfig*/ivanTs2Config;

      beforeAll(async () => {
        // Register Ivan to get keys
        ivanCli = new CliCmd('ivan');
        await ivanCli.configure();
        await ivanCli.activate(gw);
        // Register the testers organisation
        await aliceCli.run('admin');
        await aliceCli.nextPrompt('add org testers');
        await aliceCli.exit();
        // Admin the testers account to add ivan
        await aliceCli.run('admin', '--account', 'testers');
        await aliceCli.nextPrompt('add admin ivan');
        await aliceCli.exit();
        // Add a new testers timesheet
        await aliceCli.run('open', 'testers/ts2');
        await aliceCli.nextPrompt('add "alice testing"');
        await aliceCli.exit();
        // Ivan needs to join the timesheet at least once to register himself
        await ivanCli.run('open', 'testers/ts2');
        await ivanCli.exit();
        ivanTs2Config = {
          '@id': 'ivan', '@domain': 'ts2.testers.timeld.ex.org', genesis: false,
          '@context': timeldContext, ...ivanCli.readConfig()
        };
      });

      afterAll(() => ivanCli.cleanup());

      describe('using malware clone', () => {
        let /**@type MeldClone*/ivanClone;

        afterEach(() => ivanClone?.close());

        test('ignores an attacker updating another user\'s entry', async () => {
          await aliceCli.run('open', 'testers/ts2');
          ivanClone = await new MalwareCloneFactory({
            disablePermissions: true
          }).clone(ivanTs2Config, null,
            new TimeldPrincipal('http://timeld.ex.org/ivan', ivanTs2Config));
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
          await aliceCli.nextPrompt('list');
          await aliceCli.findByText('alice testing');
          await aliceCli.exit();
        });

        test('an attacker cannot change timesheet admins', async () => {
          ivanClone = await new MalwareCloneFactory().clone(ivanTs2Config, null,
            new TimeldPrincipal('http://timeld.ex.org/ivan', ivanTs2Config));
          await expect(ivanClone.write({
            '@id': 'http://timeld.ex.org/alice', key: 'Bobby Tables'
          })).rejects.toMatch(/Agreement not provable/);
        });
      });

      test('voids an entry concurrent with user revocation', async () => {
        await ivanCli.run('open', 'testers/ts2');
        await aliceCli.run('admin', '--account', 'testers');
        // Ensure that the prompts are ready, to ensure concurrency
        await ivanCli.nextPrompt();
        await aliceCli.nextPrompt();
        // Admin the testers account to remove Ivan
        aliceCli.type('remove admin ivan');
        // At the same time, add an Ivan entry
        ivanCli.type('add "ivan testing"');
        // Exit Alice's admin session and check
        await aliceCli.exit();
        await aliceCli.run('open', 'testers/ts2');
        await aliceCli.nextPrompt('list');
        await aliceCli.nextPrompt(); // Make sure list is complete
        await aliceCli.findByText(/"alice testing"/);
        expect(aliceCli.queryByText(/"ivan testing"/)).toBe(false);
        // (Ivan's session will die, so can't check there)
        await aliceCli.exit();
      });
    });
  });
});