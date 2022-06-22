import { describe, expect, test } from '@jest/globals';
import { Entry } from 'timeld-common';
import { DefaultFormat } from '../lib/DisplayFormat.mjs';
import { exampleEntryJson } from 'timeld-common/test/fixtures.mjs';

describe('Default Entry format', () => {
  test('formats entry as a label', () => {
    const start = new Date('2022-05-06T10:24:22.139Z');
    const entry = Entry.fromJSON(exampleEntryJson(start));
    expect(DefaultFormat.entryLabel(entry)).toMatch(
      `#1: testing (${start.toLocaleString()}, 1 hour)`);
  });
});



