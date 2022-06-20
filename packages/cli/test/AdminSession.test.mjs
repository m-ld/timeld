import { describe, expect, jest, test } from '@jest/globals';
import MockGateway from 'timeld-common/test/MockGateway.mjs';
import Account from 'timeld-gateway/lib/Account.mjs';
import AdminSession from '../lib/AdminSession.mjs';

describe('Administration session', () => {
  let gateway;
  let outLines, errLines;

  beforeEach(async () => {
    gateway = new MockGateway({ domainName: 'ex.org' });
    // noinspection JSCheckFunctionSignatures using mock gateway
    const userAccount = new Account(gateway, {
      name: 'test', emails: ['test@ex.org']
    });
    await gateway.initialise(userAccount);
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
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/pr1');
      outLines.mockReset();
      await session.execute('rm project pr1', outLines, errLines);
      await session.execute('ls project', outLines, errLines);
      expect(outLines).not.toHaveBeenCalled();
    });

    test('Add timesheet project link', async () => {
      await session.execute('add timesheet ts1', outLines, errLines);
      await session.execute('add project pr1', outLines, errLines);
      await session.execute('add link ts1 --project pr1', outLines, errLines);
      await session.execute('ls link --ts ts1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/pr1');
      await session.execute('ls link --project pr1', outLines, errLines);
      expect(outLines).toHaveBeenCalledWith('test/ts1');
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
  });
});