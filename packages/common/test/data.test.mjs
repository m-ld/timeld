import { Entry, isTimeldType, Project, Timesheet } from '..';
import { isPropertiesForm, isSchema, isValidSchema, validate } from 'jtd';
import { exampleEntryJson, exampleProjectJson, exampleTimesheetJson } from './fixtures.mjs';

function testTimeldType(Class, exampleJson) {
  test('to JSON', () => {
    expect(Class.fromJSON(exampleJson).toJSON()).toEqual(exampleJson);
  });

  test('has a properties Schema', () => {
    expect(isSchema(Class.SCHEMA)).toBe(true);
    expect(isValidSchema(Class.SCHEMA)).toBe(true);
    expect(isPropertiesForm(Class.SCHEMA)).toBe(true);
  });

  test('validates an example', () => {
    expect(validate(Class.SCHEMA, exampleJson)).toEqual([]);
  });

  test('validates as Timeld type', () => {
    expect(validate(isTimeldType, exampleJson)).toEqual([]);
  });
}

describe('Timesheet entry', () => {
  testTimeldType(Entry, exampleEntryJson());

  test('from JSON', () => {
    const entry = Entry.fromJSON(exampleEntryJson(new Date('2022-05-06T10:24:22.139Z')));
    expect(entry.seqNo).toBe('1');
    expect(entry.sessionId).toBe('session123');
    expect(entry.activity).toBe('testing');
    expect(entry.providerId).toBe('test');
    expect(entry.start.toISOString()).toBe('2022-05-06T10:24:22.139Z');
    expect(entry.duration).toBe(60);
  });
});

describe('Project', () => {
  testTimeldType(Project, exampleProjectJson);

  test('from JSON', () => {
    const project = Project.fromJSON(exampleProjectJson);
    expect(project.id.toString()).toBe('test/pr1');
  });
});

describe('Timesheet', () => {
  testTimeldType(Timesheet, exampleTimesheetJson);

  test('from JSON', () => {
    const timesheet = Timesheet.fromJSON(exampleTimesheetJson);
    expect(timesheet.id.toString()).toBe('test/ts1');
  });
});