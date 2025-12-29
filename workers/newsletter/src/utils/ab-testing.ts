/**
 * A/B Testing Utility Functions
 *
 * Provides helpers for A/B test execution:
 * - Test ratio calculation based on subscriber count
 * - Score calculation for winner determination
 * - Subscriber splitting for test groups
 */

/**
 * Get test ratio based on subscriber count
 * < 100: 50% (all subscribers in test)
 * 100-500: 20%
 * > 500: 10%
 */
export function getTestRatio(subscriberCount: number): number {
  if (subscriberCount < 100) return 0.5;
  if (subscriberCount <= 500) return 0.2;
  return 0.1;
}

/**
 * Calculate A/B test score
 * Weighted: 70% open rate + 30% click rate
 */
export function calculateAbScore(openRate: number, clickRate: number): number {
  return openRate * 0.7 + clickRate * 0.3;
}

/**
 * Determine winner based on scores
 * A wins on tie
 */
export function determineWinner(
  statsA: { open_rate: number; click_rate: number },
  statsB: { open_rate: number; click_rate: number }
): 'A' | 'B' {
  const scoreA = calculateAbScore(statsA.open_rate, statsA.click_rate);
  const scoreB = calculateAbScore(statsB.open_rate, statsB.click_rate);
  return scoreA >= scoreB ? 'A' : 'B';
}

/**
 * Fisher-Yates shuffle
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Split subscribers into A, B, and remaining groups
 */
export function splitSubscribers<T>(
  subscribers: T[],
  testRatio: number
): { groupA: T[]; groupB: T[]; remaining: T[] } {
  const shuffled = shuffle(subscribers);
  const testCount = Math.floor(subscribers.length * testRatio);
  const halfTest = Math.floor(testCount / 2);

  return {
    groupA: shuffled.slice(0, halfTest),
    groupB: shuffled.slice(halfTest, halfTest * 2),
    remaining: shuffled.slice(halfTest * 2),
  };
}
