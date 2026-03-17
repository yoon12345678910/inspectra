import { describe, expect, it } from 'vitest';
import { safeSerialize } from '@inspectra/core';

describe('safeSerialize', () => {
  it('handles circular references', () => {
    const value: Record<string, unknown> = { name: 'inspectra' };
    value.self = value;

    expect(safeSerialize(value)).toEqual({
      name: 'inspectra',
      self: '[Circular]'
    });
  });

  it('serializes errors into a plain object', () => {
    const error = new Error('boom');
    const serialized = safeSerialize(error);

    expect(serialized).toMatchObject({
      __type: 'Error',
      message: 'boom'
    });
  });
});

