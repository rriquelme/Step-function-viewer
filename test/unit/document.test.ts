import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFormat, looksLikeStateMachine, parseDocument } from '../../src/asl/document';
import { buildGraph } from '../../src/asl/graph';
import { analyzeVariables } from '../../src/analysis/variables';
import { buildViewModel } from '../../src/model/viewModel';

const YAML = `
QueryLanguage: JSONata
StartAt: Define
States:
  Define:
    Type: Pass
    Assign:
      orderId: "{% $states.input.id %}"
    Next: Use
  Use:
    Type: Task
    Resource: arn
    Arguments:
      Payload: "{% { 'id': $orderId } %}"
    End: true
`;

describe('detectFormat', () => {
  it('detects yaml vs json by extension', () => {
    expect(detectFormat('foo.asl.yaml')).toBe('yaml');
    expect(detectFormat('foo.asl.yml')).toBe('yaml');
    expect(detectFormat('foo.asl.json')).toBe('json');
    expect(detectFormat('foo.asl')).toBe('json');
  });
});

describe('parseDocument (yaml)', () => {
  it('parses a YAML state machine into a machine object', () => {
    const { machine } = parseDocument(YAML, 'yaml');
    expect(machine?.StartAt).toBe('Define');
    expect(Object.keys(machine!.States)).toEqual(['Define', 'Use']);
  });

  it('resolves source ranges for click-to-source', () => {
    const { rangeAt } = parseDocument(YAML, 'yaml');
    const range = rangeAt(['States', 'Define', 'Assign', 'orderId']);
    expect(range).toBeDefined();
    expect(range!.end).toBeGreaterThan(range!.start);
    // The range should cover the assigned JSONata expression.
    expect(YAML.slice(range!.start, range!.end)).toContain('$states.input.id');
  });

  it('reports YAML syntax errors', () => {
    const { errors } = parseDocument('StartAt: A\n  bad: : :', 'yaml');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('feeds the graph and variable analysis like JSON does', () => {
    const { machine, rangeAt } = parseDocument(YAML, 'yaml');
    const graph = buildGraph(machine, rangeAt);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['Define', 'Use']);

    const analysis = analyzeVariables(machine, graph, rangeAt);
    const orderId = analysis.variables.find((v) => v.name === 'orderId')!;
    expect(orderId.definitions[0].stateName).toBe('Define');
    expect(orderId.references[0].stateName).toBe('Use');
    expect(orderId.references[0].range).toBeDefined();
  });
});

describe('looksLikeStateMachine', () => {
  it('recognizes a YAML state machine', () => {
    expect(looksLikeStateMachine(YAML, 'yaml')).toBe(true);
    expect(looksLikeStateMachine('just: a map', 'yaml')).toBe(false);
  });
});

describe('buildViewModel with the bundled YAML example', () => {
  it('produces the same shape as the JSON example', () => {
    const text = readFileSync(
      resolve(__dirname, '../../examples/order-processing.asl.yaml'),
      'utf8',
    );
    const model = buildViewModel(text, 'yaml');
    expect(model.ok).toBe(true);
    expect(model.queryLanguage).toBe('JSONata');
    expect(model.variables.map((v) => v.name).sort()).toEqual(['customerTier', 'orderId']);
    expect(model.nodes.some((n) => n.id === 'ShipItems/item/ShipItem')).toBe(true);
  });
});
