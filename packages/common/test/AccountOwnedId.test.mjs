import { AccountOwnedId } from '..';

describe('Timesheet Id', () => {
  test('from full display string', () => {
    const tsId = AccountOwnedId.fromString('org/ts@gw.net');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
    expect(tsId.isRelative).toBe(false);
    expect(tsId.toString()).toBe('org/ts@gw.net');
    expect(() => tsId.validate()).not.toThrow();
    expect(tsId.toPath()).toEqual(['net', 'gw', 'org', 'ts']);
    expect(tsId.toDomain()).toEqual('ts.org.gw.net');
    expect(tsId.toIri()).toEqual('http://gw.net/org/ts');
    expect(tsId.toRelativeIri()).toEqual('org/ts');
    expect(tsId.toReference()).toEqual({ '@id': 'http://gw.net/org/ts' });
  });

  test('from only timesheet', () => {
    const tsId = AccountOwnedId.fromString('ts');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBeUndefined();
    expect(tsId.gateway).toBeUndefined();
    expect(tsId.toString()).toBe('ts');
    expect(() => tsId.validate()).toThrow();
  });

  test('from account and timesheet', () => {
    const tsId = AccountOwnedId.fromString('org/ts');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBeUndefined();
    expect(tsId.isRelative).toBe(true);
    expect(tsId.toString()).toBe('org/ts');
    expect(() => tsId.validate()).not.toThrow();
  });

  test('from path', () => {
    const tsId = AccountOwnedId.fromPath(['net', 'gw', 'org', 'ts']);
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });

  test('from domain', () => {
    const tsId = AccountOwnedId.fromDomain('ts.org.gw.net');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });

  test('from relative IRI', () => {
    const tsId = AccountOwnedId.fromIri('org/ts');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBeUndefined();
    expect(tsId.isRelative).toBe(true);
    expect(tsId.toIri()).toBe('org/ts');
    expect(() => tsId.validate()).not.toThrow();
  });

  test('from absolute IRI', () => {
    let tsId = AccountOwnedId.fromIri('https://gw.net/org/ts');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
    tsId = AccountOwnedId.fromIri('org/ts', 'gw.net');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
    tsId = AccountOwnedId.fromIri('http://gw.net:8080/org/ts/what');
    expect(tsId.name).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });
});
