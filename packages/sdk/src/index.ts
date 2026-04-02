import { bootstrapInspectraAgent, enablePlugin as enableAgentPlugin, type InspectraPlugin } from '@inspectra/agent-main';
import { createErudaMediaPermissionsPlugin } from '@inspectra/eruda-plugin-media-permissions';
import { createErudaWebRtcPlugin } from '@inspectra/eruda-plugin-webrtc';
import { createErudaWebSocketPlugin } from '@inspectra/eruda-plugin-websocket';
import {
  createErudaRemotePlugin,
  getRemoteState,
  updateRemoteState,
  pushConsoleEntry,
  pushRemoteWebSocketEvent,
  pushRemoteWebRtcEvent,
  type RemoteCommand,
  type ConsoleEntry
} from '@inspectra/eruda-plugin-remote';
import { RelayClient, type RelayMessage } from './relay-client';
import { handleRemoteCommand, installConsoleStream, sendDeviceInfo, createId } from './remote-handler';

export type { RelayMessage, RelayClientOptions } from './relay-client';

export type PluginName = 'websocket' | 'webrtc' | 'media' | 'remote';

const ALL_PLUGINS: PluginName[] = ['websocket', 'webrtc', 'media', 'remote'];
const STORAGE_KEY = 'inspectra:enabled-plugins';

const loadPersistedPlugins = (): PluginName[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown): p is PluginName =>
      typeof p === 'string' && ALL_PLUGINS.includes(p as PluginName)
    );
  } catch {
    return [];
  }
};

const persistPlugins = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...activatedPlugins]));
  } catch {
    // localStorage may be unavailable (incognito, iframe sandbox)
  }
};

export interface InspectraOptions {
  relay?: string;
  room?: string;
  eruda?: boolean;
  plugins?: PluginName[];
}

interface InspectraState {
  initialized: boolean;
  sessionId: string;
  relay: RelayClient | null;
  erudaLoaded: boolean;
  cleanupConsoleStream: (() => void) | null;
}

const ERUDA_CDN = 'https://cdn.jsdelivr.net/npm/eruda';
const GLOBAL_KEY = '__INSPECTRA_SDK__';
const activatedPlugins = new Set<PluginName>();

const getState = (): InspectraState => {
  const win = window as unknown as Record<string, unknown>;
  if (!win[GLOBAL_KEY]) {
    win[GLOBAL_KEY] = {
      initialized: false,
      sessionId: '',
      relay: null,
      erudaLoaded: false,
      cleanupConsoleStream: null
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

const addPluginTab = (name: PluginName) => {
  const eruda = (window as unknown as { eruda?: typeof import('eruda').default }).eruda;
  if (!eruda) return;

  if (name !== 'remote') {
    enableAgentPlugin(name as InspectraPlugin);
  }

  switch (name) {
    case 'webrtc': eruda.add(createErudaWebRtcPlugin()); break;
    case 'media': eruda.add(createErudaMediaPermissionsPlugin()); break;
    case 'websocket': eruda.add(createErudaWebSocketPlugin()); break;
    case 'remote': eruda.add(createErudaRemotePlugin()); break;
  }
};

/** Activate without toggle (for initial load / auto-restore) */
const activatePlugin = (name: PluginName) => {
  if (activatedPlugins.has(name)) return;
  activatedPlugins.add(name);
  addPluginTab(name);
  persistPlugins();
};

const PLUGIN_DEFS: { name: PluginName; label: string; desc: string }[] = [
  { name: 'websocket', label: 'WebSocket Inspector', desc: 'WebSocket 통신 모니터링' },
  { name: 'webrtc', label: 'WebRTC Inspector', desc: 'WebRTC 연결 상태 및 통계' },
  { name: 'media', label: 'Media Permissions', desc: '카메라/마이크 권한 상태' },
  { name: 'remote', label: 'Remote Debugging', desc: '원격 디버깅 (PC ↔ 모바일)' }
];

const createPluginsTab = () => (erudaApi: typeof import('eruda').default) => {
  class PluginsTool extends erudaApi.Tool {
    name = 'plugins';
    private panel?: { html(v: string): void; show(): void; hide(): void };

    init($el: unknown) {
      super.init($el);
      this.panel = $el as typeof this.panel;
      this.render();
    }

    render() {
      if (!this.panel) return;

      const rows = PLUGIN_DEFS.map(({ name, label, desc }) => {
        const checked = activatedPlugins.has(name);
        return `<div class="ip-row" data-plugin="${name}">
          <div class="ip-info">
            <div class="ip-label">${label}</div>
            <div class="ip-desc">${desc}</div>
          </div>
          <label class="ip-switch">
            <input type="checkbox" ${checked ? 'checked' : ''} data-name="${name}" />
            <span class="ip-slider"></span>
          </label>
        </div>`;
      }).join('');

      this.panel.html(`<div class="ip-root">
        <style>
          .ip-root { padding: 10px; color: inherit; font-size: 12px; }
          .ip-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 10px; border-bottom: 1px solid var(--border, rgba(127,127,127,.15));
          }
          .ip-info { flex: 1; min-width: 0; }
          .ip-label { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
          .ip-desc { font-size: 11px; opacity: .5; }
          .ip-switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; margin-left: 12px; }
          .ip-switch input { opacity: 0; width: 0; height: 0; }
          .ip-slider {
            position: absolute; cursor: pointer; inset: 0;
            background: rgba(127,127,127,.3); border-radius: 22px; transition: .2s;
          }
          .ip-slider::before {
            content: ''; position: absolute; height: 16px; width: 16px;
            left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s;
          }
          .ip-switch input:checked + .ip-slider { background: #39b54a; }
          .ip-switch input:checked + .ip-slider::before { transform: translateX(18px); }
        </style>
        <div class="ip-title" style="font-size:14px;font-weight:600;padding:6px 10px 12px;opacity:.7">Inspectra Plugins</div>
        ${rows}
      </div>`);

      requestAnimationFrame(() => this.bind());
    }

    private bind() {
      const eruda = (window as unknown as { eruda?: typeof import('eruda').default }).eruda;
      if (!eruda) return;

      document.querySelectorAll<HTMLInputElement>('.ip-root input[data-name]').forEach((input) => {
        input.addEventListener('change', () => {
          const name = input.dataset.name as PluginName;
          if (input.checked) {
            activatePlugin(name);
          } else {
            activatedPlugins.delete(name);
            try { eruda.remove(name); } catch {}
            persistPlugins();
          }
        });
      });
    }

    show() { (this.panel as { show(): void })?.show(); return this; }
    hide() { (this.panel as { hide(): void })?.hide(); return this; }
    destroy() { super.destroy(); }
  }
  return new PluginsTool();
};

const initEruda = (sessionId: string, plugins: PluginName[]) => {
  const eruda = (window as unknown as { eruda: typeof import('eruda').default }).eruda;
  if (!eruda) return;

  eruda.init({
    autoScale: true,
    useShadowDom: false,
    tool: ['console', 'elements', 'network', 'resources', 'sources', 'info', 'snippets', 'settings'],
    defaults: { theme: 'Dark', displaySize: 70 }
  });

  // Activate requested plugins + restore persisted plugins
  const persisted = loadPersistedPlugins();
  const toActivate = new Set([...plugins, ...persisted]);
  for (const name of toActivate) {
    activatePlugin(name);
  }

  // Add Plugins tab with toggle switches (reads activatedPlugins for initial state)
  eruda.add(createPluginsTab());

  eruda.get('info')?.add('Inspectra Session', () => sessionId);
  eruda.get('info')?.add('Inspectra Runtime', 'SDK');
  eruda.show();
};

const handleRelayEvent = (msg: RelayMessage, state: InspectraState) => {
  const remote = getRemoteState();

  switch (msg.kind) {
    case 'websocket':
      pushRemoteWebSocketEvent(msg.payload);
      break;
    case 'webrtc':
      pushRemoteWebRtcEvent(msg.payload);
      break;
    case 'media':
      updateRemoteState({ mediaPermissions: msg.payload });
      break;
    case 'device-info':
      updateRemoteState({ deviceInfo: msg.payload as typeof remote.deviceInfo });
      break;
    case 'console-stream':
      pushConsoleEntry(msg.payload as ConsoleEntry);
      break;
    case 'remote-command': {
      const cmd = msg.payload as RemoteCommand;
      const response = handleRemoteCommand(cmd);
      state.relay?.sendEvent('remote-response', response);
      break;
    }
    case 'remote-response': {
      const resp = msg.payload as { id: string; success: boolean; result?: unknown; error?: string };
      // Match to pending eval
      if (resp.result && typeof resp.result === 'object' && 'type' in (resp.result as Record<string, unknown>)) {
        const r = resp.result as Record<string, unknown>;
        if (r.type === 'localStorage' || r.type === 'sessionStorage' || r.type === 'cookie') {
          updateRemoteState({ storageData: resp.result as typeof remote.storageData });
          break;
        }
      }
      if (Array.isArray(resp.result)) {
        updateRemoteState({ networkRequests: resp.result as unknown[] });
        break;
      }
      // Eval response
      const evalEntry = {
        input: (remote as unknown as { _pendingEval?: string })._pendingEval ?? '',
        output: resp.success ? String(resp.result ?? '') : String(resp.error ?? 'Error'),
        success: resp.success,
        ts: Date.now()
      };
      remote.evalHistory.push(evalEntry);
      if (remote.evalHistory.length > 50) remote.evalHistory.shift();
      updateRemoteState({});
      break;
    }
    default:
      break;
  }
};

const connectRelay = (state: InspectraState, url: string, room: string) => {
  const agent = (window as unknown as { __INSPECTRA_AGENT__?: { onEvent?: (e: { type: string; data: unknown }) => void } }).__INSPECTRA_AGENT__;

  state.relay = new RelayClient({
    url,
    room,
    onStatusChange: (status) => {
      const remote = getRemoteState();
      updateRemoteState({ connected: status === 'connected' });
      if (status === 'connected') {
        sendDeviceInfo(state.relay!);
        state.cleanupConsoleStream = installConsoleStream(state.relay!);
      }
      if (status === 'disconnected' && state.cleanupConsoleStream) {
        state.cleanupConsoleStream();
        state.cleanupConsoleStream = null;
      }
    },
    onPeerCount: (count) => {
      updateRemoteState({ peerCount: count });
    },
    onEvent: (msg) => {
      handleRelayEvent(msg, state);
    }
  });

  // Expose relay for plugin access
  (window as unknown as Record<string, unknown>).__INSPECTRA_RELAY__ = state.relay;
  (window as unknown as Record<string, unknown>).__INSPECTRA_RELAY_URL__ = url;

  if (agent) {
    agent.onEvent = (event) => {
      state.relay?.sendEvent(
        event.type as RelayMessage['kind'],
        event.data
      );
    };
  }
};

const setupRemoteEventListeners = (state: InspectraState) => {
  window.addEventListener('inspectra:remote:connect', ((e: CustomEvent) => {
    const { code, role } = e.detail as { code: string; role: string };
    const remote = getRemoteState();
    remote.role = role as 'source' | 'viewer';
    const relayUrl = String((window as unknown as Record<string, unknown>).__INSPECTRA_RELAY_URL__ ?? '');
    if (!relayUrl) return;
    if (state.relay) {
      state.relay.changeRoom(`inspectra-${code}`);
    } else {
      connectRelay(state, relayUrl, `inspectra-${code}`);
    }
    updateRemoteState({ role: role as 'source' | 'viewer' });
  }) as EventListener);

  window.addEventListener('inspectra:remote:disconnect', () => {
    state.relay?.destroy();
    state.relay = null;
    (window as unknown as Record<string, unknown>).__INSPECTRA_RELAY__ = null;
    if (state.cleanupConsoleStream) {
      state.cleanupConsoleStream();
      state.cleanupConsoleStream = null;
    }
    updateRemoteState({
      connected: false,
      peerCount: 0,
      role: 'idle',
      deviceInfo: null,
      consoleEntries: [],
      websocketEvents: [],
      webrtcEvents: [],
      mediaPermissions: null,
      storageData: null,
      networkRequests: []
    });
  });

  window.addEventListener('inspectra:remote:command', ((e: CustomEvent) => {
    const detail = e.detail as { command: string; params?: Record<string, unknown> };
    const cmd: RemoteCommand = {
      id: createId(),
      command: detail.command as RemoteCommand['command'],
      params: detail.params
    };

    // Track pending eval for response matching
    if (cmd.command === 'eval') {
      const remote = getRemoteState();
      (remote as unknown as Record<string, unknown>)._pendingEval = String(cmd.params?.code ?? '');
    }

    state.relay?.sendEvent('remote-command', cmd);
  }) as EventListener);
};

export const Inspectra = {
  async init(options: InspectraOptions = {}) {
    const state = getState();
    if (state.initialized) return;

    const {
      relay,
      room,
      eruda: enableEruda = true,
      plugins = []
    } = options;

    state.sessionId = createSessionId();
    state.initialized = true;

    // Install ALL hooks immediately (before Eruda loads) so APIs are wrapped early
    bootstrapInspectraAgent();
    setupRemoteEventListeners(state);

    if (relay) {
      (window as unknown as Record<string, unknown>).__INSPECTRA_RELAY_URL__ = relay;
      const remoteState = getRemoteState();
      const effectiveRoom = room ?? `inspectra-${remoteState.pairingCode}`;
      remoteState.role = 'source';
      connectRelay(state, relay, effectiveRoom);
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

    if (state.cleanupConsoleStream) {
      state.cleanupConsoleStream();
      state.cleanupConsoleStream = null;
    }

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
    return getState().relay?.connected ?? false;
  }
};

if (typeof window !== 'undefined') {
  (window as unknown as { Inspectra: typeof Inspectra }).Inspectra = Inspectra;
}
