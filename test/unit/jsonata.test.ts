import { describe, expect, it } from 'vitest';
import {
  extractVariableReferences,
  isJSONataExpression,
  referencesMapItem,
} from '../../src/asl/jsonata';

describe('extractVariableReferences', () => {
  it('returns nothing for non-JSONata strings', () => {
    expect(extractVariableReferences('plain string')).toEqual([]);
    expect(extractVariableReferences('arn:aws:states:::lambda:invoke')).toEqual([]);
    expect(isJSONataExpression('plain string')).toBe(false);
  });

  it('extracts a simple variable reference', () => {
    expect(extractVariableReferences("{% $customerTier = 'gold' %}")).toEqual(['customerTier']);
  });

  it('extracts multiple variables and de-duplicates', () => {
    const refs = extractVariableReferences("{% { 'a': $orderId, 'b': $orderId, 'c': $tier } %}");
    expect(refs.sort()).toEqual(['orderId', 'tier']);
  });

  it('excludes reserved context ($states) and root ($$)', () => {
    expect(extractVariableReferences('{% $states.input.orderId %}')).toEqual([]);
    expect(extractVariableReferences('{% $$ %}')).toEqual([]);
  });

  it('excludes JSONata built-in/function calls', () => {
    const refs = extractVariableReferences('{% $map($items, function($v) { $v }) %}');
    // $map is a function call; $items is a real variable; $v is a function param.
    expect(refs).toContain('items');
    expect(refs).not.toContain('map');
  });

  it('ignores $ tokens inside string literals', () => {
    expect(extractVariableReferences("{% 'literal $notavar text' %}")).toEqual([]);
  });

  it('excludes expression-local bindings ($x := ...)', () => {
    const refs = extractVariableReferences('{% ($total := $price * 2; $total) %}');
    expect(refs).toContain('price');
    expect(refs).not.toContain('total');
  });

  it('does not treat the Map item context as a user variable', () => {
    expect(extractVariableReferences('{% $states.context.Map.Item.Value.sku %}')).toEqual([]);
  });
});

describe('referencesMapItem', () => {
  it('detects JSONata and legacy Map item references', () => {
    expect(referencesMapItem('{% $states.context.Map.Item.Value %}')).toBe(true);
    expect(referencesMapItem('{% $states.context.Map.Item.Index %}')).toBe(true);
    expect(referencesMapItem('$$.Map.Item.Value')).toBe(true);
    expect(referencesMapItem('{% $orders %}')).toBe(false);
  });
});
