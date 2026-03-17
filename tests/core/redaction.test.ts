import { describe, expect, it } from 'vitest';
import { redactHeaders, redactJsonPreview } from '@inspectra/core';

describe('redaction helpers', () => {
  it('masks sensitive headers', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer secret',
        Accept: 'application/json'
      })
    ).toEqual({
      Authorization: '[REDACTED]',
      Accept: 'application/json'
    });
  });

  it('masks known JSON keys', () => {
    const result = redactJsonPreview(
      JSON.stringify({
        token: 'abc',
        nested: {
          password: '1234'
        }
      }),
      true,
      500
    );

    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('"abc"');
    expect(result).not.toContain('"1234"');
  });
});

