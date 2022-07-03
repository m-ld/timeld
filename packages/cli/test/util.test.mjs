import { expect, test } from '@jest/globals';
import { parseDuration, toDate, toDuration, toIri } from '../lib/util.mjs';

test('parse duration in minutes', () => {
  expect(parseDuration('10')).toBe(10);
  expect(parseDuration('10m')).toBe(10);
  expect(parseDuration('1h')).toBe(60);
});

test('interpret duration', () => {
  expect(toDuration(10)).toBe(10);
  expect(toDuration('10')).toBe(10);
  expect(toDuration('10m')).toBe(10);
  expect(() => toDuration({})).toThrowError(RangeError);
});

test('interpret IRI', () => {
  expect(toIri('test')).toBe('test');
  expect(toIri('http://ex.org/#test')).toBe('http://ex.org/#test');
  expect(toIri({ '@id': 'test' })).toBe('test');
  expect(toIri(null)).toBeNull();
  expect(() => toIri({})).toThrowError(RangeError);
});

test('interpret Date', () => {
  const example = new Date();
  expect(toDate(example)).toEqual(example);
  expect(toDate(example.toISOString())).toEqual(example);
  expect(() => toDate(null)).toThrowError(RangeError);
  expect(() => toDate({})).toThrowError(RangeError);
});