import { describe, it, expect } from 'vitest';
import { isValidTime } from '../lib/validation';

describe('isValidTime', () => {
  it('should accept valid times', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('12:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('should reject invalid hour values', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('25:00')).toBe(false);
    expect(isValidTime('99:00')).toBe(false);
  });

  it('should reject invalid minute values', () => {
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('12:99')).toBe(false);
    expect(isValidTime('00:61')).toBe(false);
  });

  it('should reject invalid formats', () => {
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('09:5')).toBe(false);
    expect(isValidTime('0930')).toBe(false);
    expect(isValidTime('09-30')).toBe(false);
    expect(isValidTime('')).toBe(false);
    expect(isValidTime('invalid')).toBe(false);
  });

  it('should reject edge cases like 25:99', () => {
    expect(isValidTime('25:99')).toBe(false);
  });
});
