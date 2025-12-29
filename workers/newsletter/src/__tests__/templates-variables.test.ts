import { describe, it, expect } from 'vitest';
import { replaceVariables } from '../lib/templates/variables';

describe('replaceVariables', () => {
  it('should replace {{subscriber.name}} with name', () => {
    const result = replaceVariables('Hello {{subscriber.name}}!', {
      subscriberName: 'John',
      unsubscribeUrl: 'http://example.com/unsub',
    });
    expect(result).toBe('Hello John!');
  });

  it('should replace {{unsubscribe_url}} with URL', () => {
    const result = replaceVariables('Click {{unsubscribe_url}} to unsubscribe', {
      subscriberName: 'John',
      unsubscribeUrl: 'http://example.com/unsub/abc123',
    });
    expect(result).toBe('Click http://example.com/unsub/abc123 to unsubscribe');
  });

  it('should fallback to empty string when name is null', () => {
    const result = replaceVariables('Hello {{subscriber.name}}!', {
      subscriberName: null,
      unsubscribeUrl: 'http://example.com/unsub',
    });
    expect(result).toBe('Hello !');
  });

  it('should handle multiple variables', () => {
    const result = replaceVariables(
      '{{subscriber.name}}さん、配信停止は{{unsubscribe_url}}から',
      {
        subscriberName: '田中',
        unsubscribeUrl: 'http://example.com/unsub',
      }
    );
    expect(result).toBe('田中さん、配信停止はhttp://example.com/unsubから');
  });
});
