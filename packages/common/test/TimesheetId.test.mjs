import { TimesheetId } from '..';

describe('Timesheet Id', () => {
  test('from full display string', () => {
    const tsId = TimesheetId.fromString('org/ts@gw.net');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
    expect(tsId.toString()).toBe('org/ts@gw.net');
    expect(() => tsId.validate()).not.toThrow();
    expect(tsId.toPath()).toEqual(['net', 'gw', 'org', 'ts']);
    expect(tsId.toDomain()).toEqual('ts.org.gw.net');
    expect(tsId.toUrl()).toEqual('http://gw.net/org/ts');
  });

  test('from only timesheet', () => {
    const tsId = TimesheetId.fromString('ts');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBeUndefined();
    expect(tsId.gateway).toBeUndefined();
    expect(tsId.toString()).toBe('ts');
    expect(() => tsId.validate()).toThrow();
  });

  test('from account and timesheet', () => {
    const tsId = TimesheetId.fromString('org/ts');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBeUndefined();
    expect(tsId.toString()).toBe('org/ts');
    expect(() => tsId.validate()).not.toThrow();
  });

  test('from path', () => {
    const tsId = TimesheetId.fromPath(['net', 'gw', 'org', 'ts']);
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });

  test('from domain', () => {
    const tsId = TimesheetId.fromDomain('ts.org.gw.net');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });

  test('from URL', () => {
    let tsId = TimesheetId.fromUrl('https://gw.net/org/ts');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
    tsId = TimesheetId.fromUrl('http://gw.net:8080/org/ts/what');
    expect(tsId.timesheet).toBe('ts');
    expect(tsId.account).toBe('org');
    expect(tsId.gateway).toBe('gw.net');
  });
});
