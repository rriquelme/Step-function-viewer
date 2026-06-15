import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument } from '../../src/asl/document';
import { buildGraph } from '../../src/asl/graph';
import { analyzeVariables } from '../../src/analysis/variables';

function analyze(doc: object) {
  const { machine, rangeAt } = parseDocument(JSON.stringify(doc));
  const graph = buildGraph(machine, rangeAt);
  return analyzeVariables(machine, graph, rangeAt);
}

describe('analyzeVariables', () => {
  it('records definitions from Assign and references from JSONata fields', () => {
    const analysis = analyze({
      QueryLanguage: 'JSONata',
      StartAt: 'Define',
      States: {
        Define: {
          Type: 'Pass',
          Assign: { orderId: '{% $states.input.id %}' },
          Next: 'Use',
        },
        Use: {
          Type: 'Task',
          Resource: 'arn',
          Arguments: { Payload: '{% { "id": $orderId } %}' },
          End: true,
        },
      },
    });

    const orderId = analysis.variables.find((v) => v.name === 'orderId');
    expect(orderId).toBeDefined();
    expect(orderId!.definitions.map((d) => d.stateName)).toEqual(['Define']);
    expect(orderId!.references.map((r) => r.stateName)).toEqual(['Use']);
    expect(orderId!.references[0].field).toBe('Arguments');

    expect(analysis.perState['Define'].created).toEqual(['orderId']);
    expect(analysis.perState['Use'].used).toEqual(['orderId']);

    // Source ranges are captured for jump-to-source.
    expect(orderId!.definitions[0].range).toBeDefined();
    expect(orderId!.references[0].range).toBeDefined();
    expect(orderId!.references[0].range!.end).toBeGreaterThan(orderId!.references[0].range!.start);
  });

  it('tracks variables across Parallel branches and Map item processors', () => {
    const analysis = analyze({
      QueryLanguage: 'JSONata',
      StartAt: 'Define',
      States: {
        Define: { Type: 'Pass', Assign: { orderId: '{% 1 %}' }, Next: 'P' },
        P: {
          Type: 'Parallel',
          Branches: [
            {
              StartAt: 'B',
              States: {
                B: { Type: 'Task', Resource: 'arn', Arguments: '{% $orderId %}', End: true },
              },
            },
          ],
          End: true,
        },
      },
    });

    const orderId = analysis.variables.find((v) => v.name === 'orderId')!;
    const refNodes = orderId.references.map((r) => r.nodeId);
    expect(refNodes).toContain('P/b0/B');
  });

  it('analyzes the bundled example without errors', () => {
    const text = readFileSync(
      resolve(__dirname, '../../examples/order-processing.asl.json'),
      'utf8',
    );
    const { machine, rangeAt } = parseDocument(text);
    const graph = buildGraph(machine, rangeAt);
    const analysis = analyzeVariables(machine, graph, rangeAt);

    const names = analysis.variables.map((v) => v.name);
    expect(names).toContain('orderId');
    expect(names).toContain('customerTier');

    const orderId = analysis.variables.find((v) => v.name === 'orderId')!;
    // orderId is referenced inside the Parallel branches and the Map processor.
    expect(orderId.references.length).toBeGreaterThanOrEqual(3);
  });
});
