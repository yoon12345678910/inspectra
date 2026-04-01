import type { RemoteCommand, RemoteResponse, RemoteDeviceInfo, ConsoleEntry } from '@inspectra/eruda-plugin-remote';
import type { RelayClient } from './relay-client';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cmd-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const collectDeviceInfo = (): RemoteDeviceInfo => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  language: navigator.language,
  screenWidth: screen.width,
  screenHeight: screen.height,
  devicePixelRatio: window.devicePixelRatio,
  url: location.href,
  title: document.title,
  online: navigator.onLine,
  ts: Date.now()
});

const safeStringify = (value: unknown): string => {
  try {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') return value.toString();
    if (typeof value === 'symbol') return value.toString();
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const handleEval = (params: Record<string, unknown>): RemoteResponse => {
  const code = String(params.code ?? '');
  const id = String(params._id ?? '');
  try {
    const result = new Function(`return (${code})`)();
    return { id, success: true, result: safeStringify(result) };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const handleGetStorage = (params: Record<string, unknown>): RemoteResponse => {
  const id = String(params._id ?? '');
  const type = String(params.type ?? 'localStorage');

  try {
    const entries: { key: string; value: string }[] = [];

    if (type === 'cookie') {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const eqIdx = c.indexOf('=');
        if (eqIdx >= 0) {
          entries.push({
            key: c.slice(0, eqIdx).trim(),
            value: c.slice(eqIdx + 1).trim()
          });
        }
      }
    } else {
      const storage = type === 'sessionStorage' ? sessionStorage : localStorage;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) {
          entries.push({ key, value: storage.getItem(key) ?? '' });
        }
      }
    }

    return { id, success: true, result: { type, entries } };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const handleSetStorage = (params: Record<string, unknown>): RemoteResponse => {
  const id = String(params._id ?? '');
  const type = String(params.type ?? 'localStorage');
  const key = String(params.key ?? '');
  const value = String(params.value ?? '');

  try {
    if (type === 'cookie') {
      document.cookie = `${key}=${value}`;
    } else {
      const storage = type === 'sessionStorage' ? sessionStorage : localStorage;
      storage.setItem(key, value);
    }
    return { id, success: true };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const handleDeleteStorage = (params: Record<string, unknown>): RemoteResponse => {
  const id = String(params._id ?? '');
  const type = String(params.type ?? 'localStorage');
  const key = String(params.key ?? '');

  try {
    if (type === 'cookie') {
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    } else {
      const storage = type === 'sessionStorage' ? sessionStorage : localStorage;
      storage.removeItem(key);
    }
    return { id, success: true };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const handleGetNetwork = (params: Record<string, unknown>): RemoteResponse => {
  const id = String(params._id ?? '');
  try {
    const eruda = (window as unknown as { eruda?: { get(name: string): { requests?(): unknown[] } | undefined } }).eruda;
    const networkTool = eruda?.get('network');
    const requests = networkTool?.requests?.() ?? [];
    return { id, success: true, result: requests };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const handleClearNetwork = (params: Record<string, unknown>): RemoteResponse => {
  const id = String(params._id ?? '');
  try {
    const eruda = (window as unknown as { eruda?: { get(name: string): { clear?(): void } | undefined } }).eruda;
    eruda?.get('network')?.clear?.();
    return { id, success: true };
  } catch (error) {
    return { id, success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const handleRemoteCommand = (cmd: RemoteCommand): RemoteResponse => {
  const params = { ...cmd.params, _id: cmd.id };

  switch (cmd.command) {
    case 'eval':
      return handleEval(params);
    case 'get-storage':
      return handleGetStorage(params);
    case 'set-storage':
      return handleSetStorage(params);
    case 'delete-storage':
      return handleDeleteStorage(params);
    case 'get-network':
      return handleGetNetwork(params);
    case 'clear-network':
      return handleClearNetwork(params);
    case 'reload':
      setTimeout(() => location.reload(), 100);
      return { id: cmd.id, success: true };
    case 'navigate': {
      const url = String(cmd.params?.url ?? '');
      if (url) setTimeout(() => { location.href = url; }, 100);
      return { id: cmd.id, success: true };
    }
    default:
      return { id: cmd.id, success: false, error: `Unknown command: ${cmd.command}` };
  }
};

export const installConsoleStream = (relay: RelayClient) => {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };

  const wrap = (level: ConsoleEntry['level']) => (...args: unknown[]) => {
    original[level](...args);
    relay.sendEvent('console-stream', {
      level,
      args: args.map(a => safeStringify(a)),
      ts: Date.now()
    } satisfies ConsoleEntry);
  };

  console.log = wrap('log');
  console.warn = wrap('warn');
  console.error = wrap('error');
  console.info = wrap('info');
  console.debug = wrap('debug');

  return () => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
    console.info = original.info;
    console.debug = original.debug;
  };
};

export const sendDeviceInfo = (relay: RelayClient) => {
  relay.sendEvent('device-info', collectDeviceInfo());
};

export { createId };
