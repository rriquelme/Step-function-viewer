import { describe, expect, it } from 'vitest';
import { shortResource, typeLabel } from '../../src/webview/graph/label';

describe('shortResource', () => {
  it('condenses optimized integration ARNs', () => {
    expect(shortResource('arn:aws:states:::lambda:invoke')).toBe('lambda:invoke');
    expect(shortResource('arn:aws:states:::dynamodb:putItem')).toBe('dynamodb:putItem');
    expect(shortResource('arn:aws:states:::sns:publish.waitForTaskToken')).toBe(
      'sns:publish.waitForTaskToken',
    );
  });

  it('condenses plain service ARNs to service:name', () => {
    expect(shortResource('arn:aws:lambda:us-east-1:123456789012:function:MyFn')).toBe('lambda:MyFn');
  });

  it('falls back to the function name when there is no resource', () => {
    expect(shortResource(undefined, 'enrichRecord')).toBe('enrichRecord');
    expect(shortResource(undefined, undefined)).toBeUndefined();
  });
});

describe('typeLabel', () => {
  it('appends the integration for Task states', () => {
    expect(typeLabel('Task', 'arn:aws:states:::lambda:invoke')).toBe('TASK · lambda:invoke');
  });

  it('returns TASK when a Task has no resource', () => {
    expect(typeLabel('Task')).toBe('TASK');
  });

  it('upper-cases other state types unchanged', () => {
    expect(typeLabel('Choice')).toBe('CHOICE');
    expect(typeLabel('Map')).toBe('MAP');
  });
});
