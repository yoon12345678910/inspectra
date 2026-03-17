import { clampString, isRecord } from './utils';

const SENSITIVE_HEADER_KEYS = ['authorization', 'cookie', 'set-cookie'];
const SENSITIVE_BODY_KEYS = [
  'token',
  'password',
  'email',
  'phone',
  'ssn',
  'resident',
  'secret'
];

const MASK = '[REDACTED]';

export const redactHeaders = (headers?: Record<string, string>) => {
  if (!headers) {
    return headers;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_KEYS.includes(key.toLowerCase()) ? MASK : value
    ])
  );
};

export const redactText = (value: string, enabled: boolean, maxLength: number) => {
  if (!enabled) {
    return clampString(value, maxLength);
  }

  let next = clampString(value, maxLength);
  next = next.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${MASK}`);
  next = next.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, MASK);
  next = next.replace(/\b\d{2,4}[- ]?\d{3,4}[- ]?\d{4}\b/g, MASK);
  return next;
};

export const redactObject = (value: unknown, enabled: boolean): unknown => {
  if (!enabled) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry, enabled));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_BODY_KEYS.some((token) => key.toLowerCase().includes(token))) {
        return [key, MASK];
      }
      return [key, redactObject(entryValue, enabled)];
    })
  );
};

export const redactJsonPreview = (
  text: string,
  enabled: boolean,
  maxLength: number
) => {
  if (!enabled) {
    return clampString(text, maxLength);
  }

  try {
    const parsed = JSON.parse(text);
    return clampString(JSON.stringify(redactObject(parsed, enabled), null, 2), maxLength);
  } catch {
    return redactText(text, enabled, maxLength);
  }
};

