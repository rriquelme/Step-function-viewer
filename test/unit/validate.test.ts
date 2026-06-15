import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/asl/document';
import { buildGraph } from '../../src/asl/graph';
import { validateStateMachine } from '../../src/asl/validate';

function diagnose(doc: object) {
  const text = JSON.stringify(doc);
  const { machine, rangeAt } = parseDocument(text);
  const graph = buildGraph(machine, rangeAt);
  return validateStateMachine(machine, graph, rangeAt);
}

describe('validateStateMachine', () => {
  it('flags a dangling transition target', () => {
    const diags = diagnose({
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: { A: { Type: 'Pass', Next: 'Missing' } },
    });
    expect(diags.some((d) => d.severity === 'error' && /unknown state "Missing"/.test(d.message))).toBe(
      true,
    );
  });

  it('flags an unreachable state', () => {
    const diags = diagnose({
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: { Type: 'Succeed' },
        Orphan: { Type: 'Succeed' },
      },
    });
    expect(diags.some((d) => /unreachable/.test(d.message))).toBe(true);
  });

  it('flags a state with neither Next nor End', () => {
    const diags = diagnose({
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: { A: { Type: 'Pass' } },
    });
    expect(diags.some((d) => /neither "Next" nor "End"/.test(d.message))).toBe(true);
  });

  it('accepts a well-formed machine', () => {
    const diags = diagnose({
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: { Type: 'Pass', Next: 'B' },
        B: { Type: 'Succeed' },
      },
    });
    expect(diags.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});
