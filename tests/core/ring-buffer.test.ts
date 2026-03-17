import { describe, expect, it } from 'vitest';
import { RingBuffer } from '@inspectra/core';

describe('RingBuffer', () => {
  it('keeps only the latest items', () => {
    const buffer = new RingBuffer<number>(3);
    buffer.pushMany([1, 2, 3, 4, 5]);

    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it('clears buffered values', () => {
    const buffer = new RingBuffer<number>(2);
    buffer.push(1);
    buffer.clear();

    expect(buffer.toArray()).toEqual([]);
  });
});

