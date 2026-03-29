import { describe, it, expect } from 'vitest';
import {
  computeTotalScore,
  normalizeGeminiJSON,
  type NormalizedEval,
} from '@/lib/evaluatorNormalize';

describe('normalizeGeminiJSON', () => {
  it('returns malformed placeholder when input is null', () => {
    const out = normalizeGeminiJSON(null);
    expect(out.overallComment).toBe('Malformed evaluation JSON.');
    expect(out.dimensions).toEqual({});
  });

  it('accepts overall_comment snake_case', () => {
    const out = normalizeGeminiJSON({
      overall_comment: 'Solid run.',
      dimensions: {
        efficiency: { score: 80, strengths: 'Fast', weaknesses: 'None' },
      },
    });
    expect(out.overallComment).toBe('Solid run.');
    expect(out.dimensions.efficiency?.score).toBe(80);
  });

  it('parses dimensions as array with name keys', () => {
    const out = normalizeGeminiJSON({
      overallComment: 'ok',
      dimensions: [
        { name: 'dim_a', score: 50, strengths: 's', weaknesses: 'w' },
        { name: 'dim_b', score: 70 },
      ],
    });
    expect(out.dimensions.dim_a?.score).toBe(50);
    expect(out.dimensions.dim_b?.score).toBe(70);
  });

  it('coerces non-numeric scores via Number()', () => {
    const out = normalizeGeminiJSON({
      overallComment: 'x',
      dimensions: {
        a: { score: '42' as unknown as number },
      },
    });
    expect(out.dimensions.a?.score).toBe(42);
  });
});

describe('computeTotalScore', () => {
  it('averages dimension scores', () => {
    const ev: NormalizedEval = {
      overallComment: '',
      dimensions: {
        a: { score: 0 },
        b: { score: 100 },
      },
    };
    expect(computeTotalScore(ev)).toBe(50);
  });

  it('returns 0 when no dimensions', () => {
    expect(
      computeTotalScore({ overallComment: '', dimensions: {} }),
    ).toBe(0);
  });
});
