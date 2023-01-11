// noinspection NpmUsedModulesInstalled
import { describe, expect, jest, test } from '@jest/globals';
import Authorization from '../lib/Authorization.mjs';
import { AccountOwnedId, UserKey } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';
import * as errors from '../rest/errors.mjs';
import AuthKey from 'timeld-common/lib/AuthKey.mjs';

describe('Authorization helper', () => {
  let gateway, account;

  beforeEach(() => {
    account = ({
      authorise: jest.fn()
    });
    gateway = {
      account: jest.fn().mockResolvedValue(account)
    };
  });

  test('initialises from bearer', async () => {
    const authKey = AuthKey.fromString('appid.keyid:secret');
    const userKey = UserKey.generate(authKey);
    const jwt = await userKey.signJwt({}, authKey, {
      expiresIn: '1m', subject: 'test'
    });
    // noinspection JSCheckFunctionSignatures
    const auth = Authorization.fromRequest({
      params: { user: 'test' },
      authorization: { scheme: 'Bearer', credentials: jwt }
    });
    expect(auth.user).toBe('test');
    expect(auth.jwt).toBe(jwt);

    account.authorise.mockImplementation(() => userKey);
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    const { acc, keyid } = await auth.verifyUser(gateway, access);
    expect(acc).toBe(account);
    expect(keyid).toBe('keyid');
    expect(account.authorise).toBeCalledWith('keyid', access);
  });

  test('rejects if jwt subject is wrong', async () => {
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid', subject: 'garbage'
    });
    // noinspection JSCheckFunctionSignatures
    const auth = Authorization.fromRequest({
      params: { user: 'test' },
      authorization: { scheme: 'Bearer', credentials: jwt }
    });
    account.authorise.mockImplementation(() => ({ key: 'appid.keyid:secret' }));
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    await expect(auth.verifyUser(gateway, access)).rejects.toThrowError(errors.UnauthorizedError);
  });

  test('rejects if account authorise fails', async () => {
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid', subject: 'test'
    });
    // noinspection JSCheckFunctionSignatures
    const auth = Authorization.fromRequest({
      params: { user: 'test' },
      authorization: { scheme: 'Bearer', credentials: jwt }
    });
    account.authorise.mockImplementation(() => Promise.reject(new errors.ForbiddenError()));
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    await expect(auth.verifyUser(gateway, access)).rejects.toThrowError(errors.UnauthorizedError);
  });

  test('initialises from basic', async () => {
    // noinspection JSCheckFunctionSignatures
    const auth = Authorization.fromRequest({
      params: {},
      authorization: {
        scheme: 'Basic',
        basic: { username: 'test', password: 'appid.keyid:secret' }
      }
    });
    expect(auth.user).toBe('test');
    expect(auth.key).toBe('appid.keyid:secret');

    const userKey = UserKey.generate('appid.keyid:secret');
    account.authorise.mockImplementation(() => userKey);
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    await auth.verifyUser(gateway, access);
    expect(account.authorise).toBeCalledWith('keyid', access);
  });

  test.todo('rejects if key is wrong');
});