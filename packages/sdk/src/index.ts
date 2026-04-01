import { bootstrapInspectraAgent } from '@inspectra/agent-main';
import { createErudaMediaPermissionsPlugin } from '@inspectra/eruda-plugin-media-permissions';
import { createErudaWebRtcPlugin } from '@inspectra/eruda-plugin-webrtc';
import { createErudaWebSocketPlugin } from '@inspectra/eruda-plugin-websocket';
import { RelayClient } from './relay-client';

export type { RelayMessage, RelayClientOptions } from './relay-client';

export interface InspectraOptions {
  relay?: string;
  room?: string;
  eruda?: boolean;
  plugins?: boolean;
}

interface InspectraState {
  initialized: boolean;
  sessionId: string;
  relay: RelayClient | null;
  erudaLoaded: boolean;
}

const ERUDA_CDN = 'https://cdn.jsdelivr.net/npm/eruda';
const GLOBAL_KEY = '__INSPECTRA_SDK__';

const getState = (): InspectraState => {
  const win = window as unknown as Record<string, unknown>;
  if (!win[GLOBAL_KEY]) {
    win[GLOBAL_KEY] = {
      initialized: false,
      sessionId: '',
      relay: null,
      erudaLoaded: false
    };
  }
  return win[GLOBAL_KEY] as InspectraState;
};

const createSessionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `inspectra-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-inspectra-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-inspectra-src', src);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.documentElement.appendChild(script);
  });

const initEruda = (sessionId: string, plugins: boolean) => {
  const eruda = (window as unknown as { eruda: typeof import('eruda').default }).eruda;
  if (!eruda) return;

  eruda.init({
    autoScale: true,
    useShadowDom: false,
    tool: ['console', 'elements', 'network', 'resources', 'sources', 'info', 'snippets', 'settings'],
    defaults: { theme: 'Dark', displaySize: 70 }
  });

  if (plugins) {
    eruda.add(createErudaWebRtcPlugin());
    eruda.add(createErudaMediaPermissionsPlugin());
    eruda.add(createErudaWebSocketPlugin());
  }

  eruda.get('info')?.add('Inspectra Session', () => sessionId);
  eruda.get('info')?.add('Inspectra Runtime', 'SDK');
  eruda.show();
};

const connectRelay = (state: InspectraState, url: string, room: string) => {
  const agent = (window as unknown as { __INSPECTRA_AGENT__?: { onEvent?: (e: { type: string; data: unknown }) => void } }).__INSPECTRA_AGENT__;

  state.relay = new RelayClient({
    url,
    room,
    onStatusChange: (status) => {
      if (typeof console !== 'undefined') {
        console.log(`[Inspectra Relay] ${status}`);
      }
    },
    onPeerCount: (count) => {
      if (typeof console !== 'undefined') {
        console.log(`[Inspectra Relay] peers in room: ${count}`);
      }
    }
  });

  if (agent) {
    agent.onEvent = (event) => {
      state.relay?.sendEvent(
        event.type as 'websocket' | 'webrtc' | 'media' | 'debugger-status',
        event.data
      );
    };
  }
};

export const Inspectra = {
  async init(options: InspectraOptions = {}) {
    const state = getState();
    if (state.initialized) return;

    const {
      relay,
      room,
      eruda: enableEruda = true,
      plugins = true
    } = options;

    state.sessionId = createSessionId();
    state.initialized = true;

    bootstrapInspectraAgent();

    if (relay) {
      connectRelay(state, relay, room ?? location.hostname);
    }

    if (enableEruda) {
      try {
        await loadScript(ERUDA_CDN);
        state.erudaLoaded = true;
        initEruda(state.sessionId, plugins);
      } catch (error) {
        console.warn('[Inspectra] Failed to load Eruda:', error);
      }
    }
  },

  destroy() {
    const state = getState();
    state.relay?.destroy();
    state.relay = null;
    state.initialized = false;

    const agent = (window as unknown as { __INSPECTRA_AGENT__?: { onEvent?: unknown } }).__INSPECTRA_AGENT__;
    if (agent) {
      agent.onEvent = undefined;
    }

    if (state.erudaLoaded) {
      try {
        const eruda = (window as unknown as { eruda?: { destroy(): void } }).eruda;
        eruda?.destroy();
      } catch {
        // ignore
      }
      state.erudaLoaded = false;
    }
  },

  get sessionId() {
    return getState().sessionId;
  },

  get isConnected() {
    return getState().relay !== null;
  }
};

// Auto-expose for script tag usage
if (typeof window !== 'undefined') {
  (window as unknown as { Inspectra: typeof Inspectra }).Inspectra = Inspectra;
}
