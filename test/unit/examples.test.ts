import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFormat } from '../../src/asl/document';
import { buildViewModel } from '../../src/model/viewModel';

const dir = resolve(__dirname, '../../examples');
const read = (f: string) => buildViewModel(readFileSync(resolve(dir, f), 'utf8'), detectFormat(f));

// All shipped examples except the intentionally-broken diagnostics demo.
const VALID = [
  'order-processing.asl.json',
  'order-processing.asl.yaml',
  'retry-catch.asl.json',
  'choice-routing.asl.json',
  'jsonpath-legacy.asl.json',
  'variables-in-scopes.asl.yaml',
  'map-output-usage.asl.yaml',
  'large-pipeline.asl.json',
];

describe('bundled examples', () => {
  for (const file of VALID) {
    it(`${file} parses with no error diagnostics`, () => {
      const model = read(file);
      expect(model.ok).toBe(true);
      const errors = model.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toEqual([]);
    });
  }

  it('variables-in-scopes exposes scope-local vars and list deliveries', () => {
    const model = read('variables-in-scopes.asl.yaml');
    const names = model.variables.map((v) => v.name);
    // Created inside the Map / Parallel item scopes:
    expect(names).toContain('linePrice');
    expect(names).toContain('reservationId');
    expect(names).toContain('paymentId');
    // Collected and delivered as lists, then consumed later:
    const priced = model.variables.find((v) => v.name === 'pricedItems')!;
    expect(priced.definitions.length).toBeGreaterThanOrEqual(1);
    expect(priced.references.length).toBeGreaterThanOrEqual(2);
    const fanOut = model.variables.find((v) => v.name === 'fanOutResults')!;
    expect(fanOut.references.some((r) => r.stateName === 'Finalize')).toBe(true);
  });

  it('map-output-usage shows one Map output consumed by several states', () => {
    const model = read('map-output-usage.asl.yaml');
    const transformed = model.variables.find((v) => v.name === 'transformed')!;
    const consumers = new Set(transformed.references.map((r) => r.stateName));
    expect(consumers.size).toBeGreaterThanOrEqual(3);
  });

  it('large-pipeline has more than 50 states', () => {
    const model = read('large-pipeline.asl.json');
    expect(model.nodes.length).toBeGreaterThan(50);
  });
});
