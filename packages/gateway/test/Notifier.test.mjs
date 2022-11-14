// noinspection JSCheckFunctionSignatures,NpmUsedModulesInstalled
import { describe, expect, test } from '@jest/globals';
import Notifier from '../lib/Notifier.mjs';

describe('Notifier', () => {
  test('uses domain as name option', () => {
    const notifier = new Notifier({
      smtp: { from: 'info@ex.org' }, '@domain': 'ex.org'
    });
    expect(notifier.transporter.options).toMatchObject({
      from: 'info@ex.org',
      name: 'ex.org'
    });
  });

  test('allows name option override', () => {
    const notifier = new Notifier({
      smtp: { from: 'info@ex.org', name: 'ex2.org' }, '@domain': 'ex.org'
    });
    expect(notifier.transporter.options).toMatchObject({
      from: 'info@ex.org',
      name: 'ex2.org'
    });
  });
});
