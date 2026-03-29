import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseLogTextWithAdapters } from '@/lib/parser';

const fixturesDir = path.join(process.cwd(), 'tests/fixtures');

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('parseLogTextWithAdapters', () => {
  it('selects langchain adapter for langchain-sample.jsonl', () => {
    const text = readFixture('langchain-sample.jsonl');
    const result = parseLogTextWithAdapters(text, { sourceType: 'generic_jsonl' });
    expect(result.strictReport.adapterUsed).toBe('langchain');
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.strictReport.parsedEvents).toBe(result.events.length);
  });

  it('selects openai_agents adapter for openai-agents-sample.jsonl', () => {
    const text = readFixture('openai-agents-sample.jsonl');
    const result = parseLogTextWithAdapters(text, { sourceType: 'generic_jsonl' });
    expect(result.strictReport.adapterUsed).toBe('openai_agents');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('selects openai_agents for generic-jsonl-sample.jsonl (contains tool_call_id)', () => {
    const text = readFixture('generic-jsonl-sample.jsonl');
    const result = parseLogTextWithAdapters(text, { sourceType: 'generic_jsonl' });
    expect(result.strictReport.adapterUsed).toBe('openai_agents');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('respects sourceType=langchain to force langchain adapter', () => {
    const text = readFixture('langchain-sample.jsonl');
    const result = parseLogTextWithAdapters(text, { sourceType: 'langchain' });
    expect(result.strictReport.adapterUsed).toBe('langchain');
  });

  it('handles minimal JSONL without throwing', () => {
    const result = parseLogTextWithAdapters('{"x":1}\n', { sourceType: 'generic_jsonl' });
    expect(result.strictReport.adapterUsed).toBe('generic_jsonl');
  });
});
