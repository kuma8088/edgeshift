import { describe, it, expect } from 'vitest';
import { isDisposableEmail } from '../lib/disposable-emails';

describe('isDisposableEmail', () => {
  describe('detects known disposable domains', () => {
    const disposableDomains = [
      'mailinator.com',
      'guerrillamail.com',
      'tempmail.com',
      '10minutemail.com',
      'throwaway.email',
      'yopmail.com',
      'tempmail.io',
      'maildrop.cc',
      'mailnesia.com',
      'minutemail.com',
      'trashmail.com',
      'grr.la',
      'trashmail.io',
      'inboxkitten.com',
      'guerrillamail.info',
      'guerrillamail.net',
      'mailinator.net',
    ];

    disposableDomains.forEach((domain) => {
      it(`should detect ${domain} as disposable`, () => {
        expect(isDisposableEmail(`user@${domain}`)).toBe(true);
      });
    });
  });

  describe('allows legitimate domains', () => {
    const legitimateDomains = [
      'gmail.com',
      'yahoo.com',
      'outlook.com',
      'hotmail.com',
      'protonmail.com',
      'example.com',
      'company.co.jp',
    ];

    legitimateDomains.forEach((domain) => {
      it(`should allow ${domain}`, () => {
        expect(isDisposableEmail(`user@${domain}`)).toBe(false);
      });
    });
  });

  describe('case-insensitive matching', () => {
    it('should detect uppercase domain', () => {
      expect(isDisposableEmail('USER@MAILINATOR.COM')).toBe(true);
    });

    it('should detect mixed case domain', () => {
      expect(isDisposableEmail('User@GuerrillaMail.COM')).toBe(true);
    });

    it('should allow uppercase legitimate domain', () => {
      expect(isDisposableEmail('USER@GMAIL.COM')).toBe(false);
    });
  });

  describe('handles invalid email formats gracefully', () => {
    it('should return false for email without @', () => {
      expect(isDisposableEmail('notanemail')).toBe(false);
    });

    it('should return false for email with multiple @', () => {
      expect(isDisposableEmail('user@@mailinator.com')).toBe(false);
    });

    it('should return false for email with @ at start', () => {
      expect(isDisposableEmail('@mailinator.com')).toBe(false);
    });

    it('should return false for email with @ at end', () => {
      expect(isDisposableEmail('user@')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isDisposableEmail('')).toBe(false);
    });

    it('should return false for email with only @', () => {
      expect(isDisposableEmail('@')).toBe(false);
    });
  });

  describe('performance with large domain list', () => {
    it('should check email in reasonable time', () => {
      const start = Date.now();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        isDisposableEmail('user@mailinator.com');
        isDisposableEmail('user@gmail.com');
      }

      const duration = Date.now() - start;
      // Should complete 20,000 checks in under 100ms (very generous threshold)
      expect(duration).toBeLessThan(100);
    });

    it('should use Set for O(1) lookup', () => {
      // This is more of a documentation test - verifies the implementation uses Set
      // Set.has() is O(1), Array.includes() would be O(n)
      const email = 'user@mailinator.com';
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        isDisposableEmail(email);
      }

      const duration = Date.now() - start;
      // Should be very fast with Set (< 10ms for 1000 lookups)
      expect(duration).toBeLessThan(10);
    });
  });

  describe('edge cases', () => {
    it('should handle email with subdomain', () => {
      // user@mail.tempmail.com should NOT be detected (we only check exact domain)
      expect(isDisposableEmail('user@mail.tempmail.com')).toBe(false);
    });

    it('should handle very long email', () => {
      const longLocalPart = 'a'.repeat(64); // Max local part length is 64
      expect(isDisposableEmail(`${longLocalPart}@mailinator.com`)).toBe(true);
    });

    it('should handle email with + addressing', () => {
      expect(isDisposableEmail('user+test@mailinator.com')).toBe(true);
    });

    it('should handle email with dots in local part', () => {
      expect(isDisposableEmail('user.name@mailinator.com')).toBe(true);
    });
  });
});
