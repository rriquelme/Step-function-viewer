import { describe, expect, it } from 'vitest';
import { parseStateMachine } from '../../src/asl/parser';
import { buildGraph } from '../../src/asl/graph';

const SIMPLE = JSON.stringify({
  QueryLanguage: 'JSONata',
  StartAt: 'A',
  States: {
    A: { Type: 'Pass', Next: 'B' },
    B: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'C' }], Default: 'D' },
    C: { Type: 'Succeed' },
    D: { Type: 'Fail' },
  },
});

const NESTED = JSON.stringify({
  QueryLanguage: 'JSONata',
  StartAt: 'P',
  States: {
    P: {
      Type: 'Parallel',
      Branches: [
        { StartAt: 'X', States: { X: { Type: 'Pass', End: true } } },
        { StartAt: 'Y', States: { Y: { Type: 'Pass', End: true } } },
      ],
      Next: 'M',
    },
    M: {
      Type: 'Map',
      ItemProcessor: { StartAt: 'Item', States: { Item: { Type: 'Pass', End: true } } },
      End: true,
    },
  },
});

describe('buildGraph', () => {
  it('builds nodes and typed edges for a flat machine', () => {
    const { machine, tree } = parseStateMachine(SIMPLE);
    const graph = buildGraph(machine, tree);

    expect(graph.startAt).toBe('A');
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C', 'D']);

    const kinds = graph.edges.map((e) => `${e.from}->${e.to}:${e.kind}`);
    expect(kinds).toContain('A->B:next');
    expect(kinds).toContain('B->C:choice');
    expect(kinds).toContain('B->D:default');
  });

  it('flattens Parallel branches and Map item processors with scoped ids', () => {
    const { machine, tree } = parseStateMachine(NESTED);
    const graph = buildGraph(machine, tree);
    const ids = graph.nodes.map((n) => n.id);

    expect(ids).toContain('P/b0/X');
    expect(ids).toContain('P/b1/Y');
    expect(ids).toContain('M/item/Item');

    const kinds = graph.edges.map((e) => `${e.from}->${e.to}:${e.kind}`);
    expect(kinds).toContain('P->P/b0/X:branch');
    expect(kinds).toContain('P->P/b1/Y:branch');
    expect(kinds).toContain('M->M/item/Item:map');
    expect(kinds).toContain('P->M:next');
  });

  it('records source ranges for click-to-source', () => {
    const { machine, tree } = parseStateMachine(SIMPLE);
    const graph = buildGraph(machine, tree);
    const a = graph.nodes.find((n) => n.id === 'A');
    expect(a?.range).toBeDefined();
    expect(a!.range!.end).toBeGreaterThan(a!.range!.start);
  });
});
