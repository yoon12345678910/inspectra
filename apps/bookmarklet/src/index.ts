import { bootstrapInspectraAgent } from '@inspectra/agent-main';
import { createErudaMediaPermissionsPlugin } from '@inspectra/eruda-plugin-media-permissions';
import { createErudaWebRtcPlugin } from '@inspectra/eruda-plugin-webrtc';

type ErudaTool = {
  add?(label: string, value: string | (() => string)): void;
  show?(): void;
  hide?(): void;
};

type ErudaApi = {
  init(options: Record<string, unknown>): void;
  add(plugin: unknown): void;
  get(name: string): ErudaTool | undefined;
  show(): void;
  hide(): void;
};

declare global {
  interface Window {
    __INSPECTRA_BOOKMARKLET__?: {
      initialized: boolean;
      loading?: Promise<void>;
      sessionId: string;
    };
    __inspectraBookmarkletLaunch?: () => Promise<void>;
    eruda?: ErudaApi;
  }
}

const ERUDA_CDN_URL = 'https://cdn.jsdelivr.net/npm/eruda';

const createSessionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `inspectra-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const ensureBookmarkletState = () => {
  if (!window.__INSPECTRA_BOOKMARKLET__) {
    window.__INSPECTRA_BOOKMARKLET__ = {
      initialized: false,
      sessionId: createSessionId()
    };
  }

  return window.__INSPECTRA_BOOKMARKLET__;
};

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-inspectra-src="${src}"]`) as
      | HTMLScriptElement
      | null;

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
        once: true
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.inspectraSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.documentElement.appendChild(script);
  });

const ensureEruda = async () => {
  const state = ensureBookmarkletState();
  if (window.eruda) {
    return window.eruda;
  }

  if (!state.loading) {
    state.loading = loadScript(ERUDA_CDN_URL);
  }

  await state.loading;

  if (!window.eruda) {
    throw new Error('Eruda was not available after loading the CDN script.');
  }

  return window.eruda;
};

export const launchInspectraBookmarklet = async () => {
  const state = ensureBookmarkletState();
  bootstrapInspectraAgent();

  const eruda = await ensureEruda();

  if (!state.initialized) {
    eruda.init({
      autoScale: true,
      useShadowDom: false,
      tool: [
        'console',
        'elements',
        'network',
        'resources',
        'sources',
        'info',
        'snippets',
        'settings'
      ],
      defaults: {
        theme: 'Dark',
        displaySize: 70
      }
    });

    eruda.add(createErudaWebRtcPlugin());
    eruda.add(createErudaMediaPermissionsPlugin());
    eruda.get('info')?.add?.('Inspectra Session', () => state.sessionId);
    eruda.get('info')?.add?.('Inspectra Runtime', 'Bookmarklet');
    state.initialized = true;
  }

  eruda.get('entryBtn')?.show?.();
  eruda.show();
};

window.__inspectraBookmarkletLaunch = launchInspectraBookmarklet;
void launchInspectraBookmarklet();
