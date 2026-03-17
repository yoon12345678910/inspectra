import { clampString, isRecord } from './utils';
import type { SerializedValue } from './types';

interface SerializeOptions {
  depth?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
}

const defaultOptions: Required<SerializeOptions> = {
  depth: 3,
  maxStringLength: 400,
  maxArrayLength: 20,
  maxObjectKeys: 20
};

export const safeSerialize = (
  value: unknown,
  options: SerializeOptions = {},
  seen = new WeakSet<object>(),
  depth = 0
): SerializedValue => {
  const config = { ...defaultOptions, ...options };

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return clampString(value, config.maxStringLength);
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'function') {
    return `[Function ${(value as Function).name || 'anonymous'}]`;
  }

  if (value instanceof Error) {
    return {
      __type: 'Error',
      name: value.name,
      message: clampString(value.message, config.maxStringLength),
      stack: clampString(value.stack ?? '', config.maxStringLength)
    };
  }

  if (typeof Node !== 'undefined' && value instanceof Node) {
    return {
      __type: 'DOMNode',
      nodeName: value.nodeName,
      text: clampString(value.textContent ?? '', 120)
    };
  }

  if (Array.isArray(value)) {
    if (depth >= config.depth) {
      return [`[Array(${value.length})]`];
    }

    return value
      .slice(0, config.maxArrayLength)
      .map((item) => safeSerialize(item, config, seen, depth + 1));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= config.depth) {
    return '[Object]';
  }

  seen.add(value);

  const output: Record<string, SerializedValue> = {};
  const entries = Object.entries(value).slice(0, config.maxObjectKeys);
  for (const [key, entryValue] of entries) {
    output[key] = safeSerialize(entryValue, config, seen, depth + 1);
  }

  return output;
};

