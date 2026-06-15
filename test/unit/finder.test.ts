import { describe, expect, it } from 'vitest';
import { finderMode, findMatchingNodeIds } from '../../src/webview/finder';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFormat } from '../../src/asl/document';
import { buildViewModel } from '../../src/model/viewModel';

const model = {
  nodes: [
    { id: 'Charge', name: 'Charge', type: 'Task', container: false, functionName: 'chargeFn', jsonPath: [] },
    { id: 'Wait', name: 'Wait', type: 'Wait', container: false, jsonPath: [] },
    // A state whose NAME collides with a variable name.
    { id: 'total', name: 'total', type: 'Pass', container: false, jsonPath: [] },
  ],
  variables: [
    {
      name: 'total',
      definitions: [{ nodeId: 'Charge', stateName: 'Charge', field: 'Assign' }],
      references: [{ nodeId: 'total', stateName: 'total', field: 'Output' }],
    },
  ],
} as unknown as Parameters<typeof findMatchingNodeIds>[0];

describe('finderMode', () => {
  it('switches to variable mode on a leading $', () => {
    expect(finderMode('total')).toBe('state');
    expect(finderMode('$total')).toBe('variable');
  });
});

describe('findMatchingNodeIds', () => {
  it('matches states by name, type, and invoked function', () => {
    expect(findMatchingNodeIds(model, 'charge')).toEqual(['Charge']);
    expect(findMatchingNodeIds(model, 'wait')).toEqual(['Wait']);
    expect(findMatchingNodeIds(model, 'chargeFn')).toEqual(['Charge']);
  });

  it('state search matches the state named "total" but not the variable', () => {
    expect(findMatchingNodeIds(model, 'total')).toEqual(['total']);
  });

  it('$ search matches the variable and returns its defining/referencing states', () => {
    expect(findMatchingNodeIds(model, '$total').sort()).toEqual(['Charge', 'total']);
  });

  it('returns nothing for empty or bare "$" queries', () => {
    expect(findMatchingNodeIds(model, '')).toEqual([]);
    expect(findMatchingNodeIds(model, '$')).toEqual([]);
  });

  it('finds a variable across the large example', () => {
    const text = readFileSync(resolve(__dirname, '../../examples/large-pipeline.asl.json'), 'utf8');
    const vm = buildViewModel(text, detectFormat('large-pipeline.asl.json'));
    // s30 is assigned by the Map stage and read by Aggregate.
    const ids = findMatchingNodeIds(vm, '$s30');
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});
