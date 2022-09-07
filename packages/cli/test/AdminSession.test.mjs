// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import MockGateway from 'timeld-common/test/MockGateway.mjs';
import Account from 'timeld-gateway/lib/Account.mjs';
import AdminSession from '../lib/AdminSession.mjs';
import { consume } from 'rx-flowable/consume';
import { toBeISODateString } from 'timeld-common/test/fixtures.mjs';
import MockIntegration from 'timeld-common/test/MockIntegration.mjs';
import { AccountOwnedId } from 'timeld-common';

expect.extend({ toBeISODateString });

describe('Administration session', () => {
  let gateway;
  let outLines, errLines;

  beforeEach(async () => {
    gateway = new MockGateway({ domainName: 'ex.org', mock: {} });
    // noinspection JSCheckFunctionSignatures using mock gateway
    const userAccount = new Account(gateway, {
      name: 'test', emails: ['test@ex.org']
    });
    await gateway.initialise(userAccount);
    // noinspection JSCheckFunctionSignatures
    gateway.initTimesheet.mockResolvedValue({
      // Required for integration revup
      write: jest.fn(proc => proc({}))
    });
    errLines = jest.fn();
    outLines = jest.fn();
  });

  afterEach(() => {
    expect(errLines).not.toHaveBeenCalled();
  });

  describe('with user account', () => {
    let /**@type {AdminSession}*/session;

    beforeEach(async () => {
      session = new AdminSession({ gateway, account: 'test' });
    });

    test('List emails', async () => {
      await session.execute('ls email', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test@ex.org');
    });

    test('Update emails', async () => {
      await session.execute('add email new@ex.org', outLines, errLines);
      await session.execute('ls email', outLines, errLines);
      expect(outLines).toBeCalledTimes(2);
      outLines.mockReset();
      await session.execute('rm email test@ex.org', outLines, errLines);
      await session.execute('ls email', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('new@ex.org');
    });

    test('Add organisation', async () => {
      await session.execute('add org org1', outLines, errLines);
      await session.execute('ls org', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('org1');
      outLines.mockReset();
      await session.execute('rm org org1', outLines, errLines);
      await session.execute('ls org', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute('ls ts', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/ts1');
      outLines.mockReset();
      await session.execute('rm ts ts1', outLines, errLines);
      await session.execute('ls ts', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add project', async () => {
      await session.execute('add project pr1 --start now', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/pr1');
      outLines.mockReset();
      await session.execute('rm project pr1', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add project duration & milestones', async () => {
      await session.execute(
        'add project pr1 --start now --duration 1w --milestone one 2',
        outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
      await expect(gateway.domain.get('test/pr1'))
        .resolves.toMatchObject({
          '@id': 'test/pr1',
          '@type': 'Project',
          'start': {
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
            '@value': expect.toBeISODateString(Date.now())
          },
          'duration': 10080, // Minutes in a week
          'milestone': expect.arrayContaining(['one', '2'])
        });
    });

    test('Add timesheet project link', async () => {
      await session.execute('add timesheet ts1', outLines, errLines);
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('add link ts1 --project pr1', outLines, errLines);
      await session.execute('ls link --ts ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/pr1');
      outLines.mockReset();
      await session.execute('ls link --project pr1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/ts1');
      outLines.mockReset();
      await session.execute('rm link pr1 --timesheet ts1', outLines, errLines);
      await session.execute('ls link --project pr1', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Cannot link missing timesheet', async () => {
      await session.execute('add project pr1', outLines, errLines);
      await expect(session.execute('add link ts1 --project pr1', outLines, errLines))
        .rejects.toThrow();
    });

    test('Cannot link missing project', async () => {
      await session.execute('add timesheet ts1', outLines, errLines);
      await expect(session.execute('add link ts1 --project pr1', outLines, errLines))
        .rejects.toThrow();
    });

    test('Reports on an owned ID', async () => {
      gateway.report = jest.fn((account, name) =>
        consume([{ '@id': `${account}/${name}`, '@type': 'Timesheet' }]));
      await session.execute('report ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('Timesheet test/ts1');
      outLines.mockReset();
      await session.execute('report org1/ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('Timesheet org1/ts1');
    });

    test('Lists no integrations for timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute('ls integration --timesheet ts1', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Adds integration for timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute(
        'add integration timeld-common/test/MockIntegration.mjs ' +
        '--timesheet ts1 --config.uri http://ext.org/',
        outLines, errLines);
      expect(MockIntegration.created.syncTimesheet).toHaveBeenCalledWith(
        AccountOwnedId.fromString('test/ts1@ex.org'), expect.any(Object));
      expect(MockIntegration.created.ext).toMatchObject({
        config: JSON.stringify({ uri: 'http://ext.org/' })
      });
      await session.execute('ls integration --timesheet ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('timeld-common/test/MockIntegration.mjs');
    });

    test('Cannot re-add integration for timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute(
        'add integration timeld-common/test/MockIntegration.mjs ' +
        '--timesheet ts1 --config.uri http://ext.org/',
        outLines, errLines);
      await expect(session.execute(
        // The duplicate check does not care about config
        'add integration timeld-common/test/MockIntegration.mjs --timesheet ts1',
        outLines, errLines)).rejects.toThrow();
    });

    test('Removes integration for timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute(
        'add integration timeld-common/test/MockIntegration.mjs --timesheet ts1',
        outLines, errLines);
      await session.execute(
        'rm integration timeld-common/test/MockIntegration.mjs --timesheet ts1',
        outLines, errLines);
      await session.execute('ls integration --timesheet ts1', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });
  });

  describe('with org account', () => {
    let /**@type {AdminSession}*/session;

    beforeEach(async () => {
      const userSession = new AdminSession({ gateway, account: 'test' });
      await userSession.execute('add org org1', outLines, errLines);
      // Add a project and account for cross-account link tests
      await userSession.execute('add project pr1', outLines, errLines);
      await userSession.execute('add ts ts1', outLines, errLines);
      session = new AdminSession({ gateway, account: 'org1' });
    });

    test('Cannot remove self as admin', async () => {
      await expect(session.execute('rm admin test', outLines, errLines))
        .rejects.toThrow();
    });

    test('Add organisation admin', async () => {
      await session.execute('add admin fred', outLines, errLines);
      await session.execute('ls admin', outLines, errLines);
      expect(outLines.mock.calls).toEqual(expect.arrayContaining([['fred'], ['test']]));
      outLines.mockReset();
      await session.execute('rm admin fred', outLines, errLines);
      await session.execute('ls admin', outLines, errLines);
      expect(outLines.mock.calls).toEqual(expect.arrayContaining([['test']]));
    });

    test('Add timesheet', async () => {
      await session.execute('add ts ts1', outLines, errLines);
      await session.execute('ls ts', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('org1/ts1');
      outLines.mockReset();
      await session.execute('rm ts ts1', outLines, errLines);
      await session.execute('ls ts', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add project', async () => {
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('org1/pr1');
      outLines.mockReset();
      await session.execute('rm project pr1', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add timesheet project link', async () => {
      await session.execute('add timesheet ts1', outLines, errLines);
      await session.execute('add link ts1 --project test/pr1', outLines, errLines);
      await session.execute('ls link --ts ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/pr1');
    });

    test('Can link owned timesheet from another account', async () => {
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('add link pr1 --ts test/ts1', outLines, errLines);
      await session.execute('ls link --ts test/ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('org1/pr1');
    });

    test('Cannot link unowned timesheet from another account', async () => {
      const fredAccount = new Account(gateway, {
        name: 'fred', emails: ['fred@ex.org']
      });
      await gateway.domain.write(fredAccount.toJSON());
      // noinspection JSCheckFunctionSignatures
      await fredAccount.write({
        '@insert': { '@id': 'fred', timesheet: { '@id': 'fred/ts1', '@type': 'Timesheet' } },
        '@where': { '@id': 'fred', '@type': 'Account' }
      });
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('add link fred/ts1 --project pr1', outLines, errLines);
      // TODO the above request is protected by a @where clause, so fails silently:
      await session.execute('ls link --project pr1', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
      await session.execute('ls link --ts fred/ts1', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Adds integration for timesheet', async () => {
      await session.execute('add timesheet ts1', outLines, errLines);
      await session.execute('add integration timeld-common/test/MockIntegration.mjs --timesheet ts1', outLines, errLines);
      await session.execute('ls integration --timesheet ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('timeld-common/test/MockIntegration.mjs');
    });
  });
});