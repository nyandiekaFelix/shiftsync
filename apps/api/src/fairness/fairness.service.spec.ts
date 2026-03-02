import { calculateStdDev } from './fairness.service';

describe('Fairness math', () => {
  it('returns 0 std dev for empty or single values', () => {
    expect(calculateStdDev([])).toBe(0);
    expect(calculateStdDev([8])).toBe(0);
  });

  it('calculates deterministic standard deviation', () => {
    const value = calculateStdDev([8, 10, 12, 10]);
    expect(Number(value.toFixed(4))).toBe(1.4142);
  });

  it('handles uneven premium-like distributions', () => {
    const value = calculateStdDev([0, 8, 0, 16]);
    expect(Number(value.toFixed(4))).toBe(6.6332);
  });
});
