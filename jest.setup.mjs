import { expect } from '@jest/globals';

expect.extend({
  toBeISODateString(received, approxTime, delta = 1000) {
    if (typeof received != 'string') {
      return {
        pass: false,
        message: `Expected ${received} to be a valid ISO date string`
      };
    }
    const date = new Date(received);
    if (date.toISOString() !== received) {
      return {
        pass: false,
        message: `Expected ${received} to be a valid ISO date string`
      };
    }
    if (approxTime != null && Math.abs(date.getTime() - approxTime) > delta) {
      return {
        pass: false,
        message: `Expected ${received} to be close to ${new Date(approxTime)}`
      };
    }
    return {
      pass: true,
      message: `Expected ${received} not to be a valid ISO date string`
    };
  }
});
