// src/__tests__/ab-testing.test.ts
import { describe, it, expect } from 'vitest';
import {
  getTestRatio,
  calculateAbScore,
  determineWinner,
  splitSubscribers,
} from '../utils/ab-testing';

describe('A/B Testing Utils', () => {
  describe('getTestRatio', () => {
    it('should return 0.5 for less than 100 subscribers', () => {
      expect(getTestRatio(50)).toBe(0.5);
      expect(getTestRatio(99)).toBe(0.5);
    });

    it('should return 0.2 for 100-500 subscribers', () => {
      expect(getTestRatio(100)).toBe(0.2);
      expect(getTestRatio(500)).toBe(0.2);
    });

    it('should return 0.1 for more than 500 subscribers', () => {
      expect(getTestRatio(501)).toBe(0.1);
      expect(getTestRatio(1000)).toBe(0.1);
    });
  });

  describe('calculateAbScore', () => {
    it('should calculate weighted score (70% open + 30% click)', () => {
      // 50% open rate, 20% click rate
      // Score = 0.5 * 0.7 + 0.2 * 0.3 = 0.35 + 0.06 = 0.41
      expect(calculateAbScore(0.5, 0.2)).toBeCloseTo(0.41);
    });

    it('should handle zero rates', () => {
      expect(calculateAbScore(0, 0)).toBe(0);
    });
  });

  describe('determineWinner', () => {
    it('should return A when A has higher score', () => {
      const statsA = { open_rate: 0.5, click_rate: 0.2 };
      const statsB = { open_rate: 0.4, click_rate: 0.1 };
      expect(determineWinner(statsA, statsB)).toBe('A');
    });

    it('should return B when B has higher score', () => {
      const statsA = { open_rate: 0.3, click_rate: 0.1 };
      const statsB = { open_rate: 0.5, click_rate: 0.2 };
      expect(determineWinner(statsA, statsB)).toBe('B');
    });

    it('should return A on tie (A priority)', () => {
      const statsA = { open_rate: 0.5, click_rate: 0.2 };
      const statsB = { open_rate: 0.5, click_rate: 0.2 };
      expect(determineWinner(statsA, statsB)).toBe('A');
    });
  });

  describe('splitSubscribers', () => {
    it('should split subscribers into A, B, and remaining groups', () => {
      const subscribers = Array.from({ length: 100 }, (_, i) => ({
        id: `sub-${i}`,
        email: `test${i}@example.com`,
      }));

      const { groupA, groupB, remaining } = splitSubscribers(subscribers, 0.2);

      // 20% total test = 10% each for A and B
      expect(groupA.length).toBe(10);
      expect(groupB.length).toBe(10);
      expect(remaining.length).toBe(80);

      // No duplicates
      const allIds = [...groupA, ...groupB, ...remaining].map((s) => s.id);
      expect(new Set(allIds).size).toBe(100);
    });
  });
});
