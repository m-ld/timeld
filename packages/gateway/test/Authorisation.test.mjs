import { describe, expect, jest, test } from '@jest/globals';
import Authorization from '../lib/Authorization.mjs';
import { AccountOwnedId } from 'timeld-common';
import jsonwebtoken from 'jsonwebtoken';

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
    const jwt = jsonwebtoken.sign({}, 'secret', {
      expiresIn: '1m', keyid: 'keyid', subject: 'test'
    });
    // noinspection JSCheckFunctionSignatures
    const auth = new Authorization({
      params: { user: 'test' },
      authorization: { scheme: 'Bearer', credentials: jwt }
    });
    expect(auth.user).toBe('test');
    expect(auth.jwt).toBe(jwt);

    account.authorise.mockImplementation(() => ({ key: 'appid.keyid:secret' }));
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    await auth.verifyUser(gateway, access);
    expect(account.authorise).toBeCalledWith('keyid', access);
  });

  test.todo('rejects if jwt subject is wrong');

  test('initialises from basic', async () => {
    // noinspection JSCheckFunctionSignatures
    const auth = new Authorization({
      params: {},
      authorization: {
        scheme: 'Basic',
        basic: { username: 'test', password: 'appid.keyid:secret' }
      }
    });
    expect(auth.user).toBe('test');
    expect(auth.key).toBe('appid.keyid:secret');

    account.authorise.mockImplementation(() => ({ key: 'appid.keyid:secret' }));
    const access = { id: AccountOwnedId.fromString('acc/test@ex.org'), forWrite: 'Timesheet' };
    await auth.verifyUser(gateway, access);
    expect(account.authorise).toBeCalledWith('keyid', access);
  });

  test.todo('rejects if key is wrong');
});