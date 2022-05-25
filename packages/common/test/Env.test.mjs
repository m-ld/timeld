import { Env } from '..';

describe('Config utilities', () => {
  describe('config merging', () => {
    test('atoms', () => {
      expect(Env.mergeConfig({}, {})).toEqual({});
      expect(Env.mergeConfig({}, undefined)).toEqual({});
      expect(Env.mergeConfig(1, 2)).toBe(2);
      // false removes config item
      expect(Env.mergeConfig(1, false)).toBeUndefined();
      expect(Env.mergeConfig(null, 1)).toBe(1);
    });

    test('deep', () => {
      expect(Env.mergeConfig({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
      expect(Env.mergeConfig({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      expect(Env.mergeConfig({ a: 1 }, { a: false })).toEqual({});
      expect(Env.mergeConfig({ '@id': 'uuid' }, { '@id': false })).toEqual({});
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: false })).toEqual({});
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: { b: false } })).toEqual({ a: {} });
      expect(Env.mergeConfig({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
    });

    test('varargs', () => {
      expect(Env.mergeConfig({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
      expect(Env.mergeConfig({ a: 1 }, { a: false }, { a: 2 })).toEqual({ a: 2 });
    });

    test('ignores non-config', () => {
      expect(Env.mergeConfig({ a: 1 }, { '_': 2 })).toEqual({ a: 1 });
      expect(Env.mergeConfig({ a: 1 }, { '$0': 2 })).toEqual({ a: 1 });
    });
  });
});