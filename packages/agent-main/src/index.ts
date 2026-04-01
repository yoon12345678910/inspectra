import {
  INSPECTRA_WEBRTC_EVENT,
  type WebRtcEvent
} from '@inspectra/eruda-plugin-webrtc';
import {
  INSPECTRA_MEDIA_PERMISSIONS_EVENT,
  createDefaultMediaPermissionSnapshot,
  type InspectraMediaPermissionsState,
  type MediaPermissionRequest,
  type MediaPermissionSnapshot,
  type MediaPermissionStateValue
} from '@inspectra/eruda-plugin-media-permissions';
import {
  INSPECTRA_WEBSOCKET_EVENT,
  type WebSocketDebuggerState,
  type WebSocketEvent
} from '@inspectra/eruda-plugin-websocket';

const BRIDGE_CHANNEL = 'inspectra:bridge';
const AGENT_RELAY_CHANNEL = 'inspectra:agent-relay';
const MAX_EVENT_HISTORY = 200;
const MAX_TEXT_PAYLOAD_CAPTURE = 16_384;
const MAX_BINARY_PAYLOAD_CAPTURE = 8_192;

interface AgentState {
  bootstrapped: boolean;
  hooksInstalled: boolean;
  sessionId: string;
}

interface InspectraRuntimeState extends InspectraMediaPermissionsState {
  webrtcEvents: WebRtcEvent[];
  websocketEvents: WebSocketEvent[];
  websocketDebugger: WebSocketDebuggerState;
}

interface InspectraAgentGlobal {
  state: AgentState;
  webrtcBuffer: RingBuffer<WebRtcEvent>;
  websocketBuffer: RingBuffer<WebSocketEvent>;
  mediaPermissions: MediaPermissionSnapshot;
  websocketDebugger: WebSocketDebuggerState;
  messageListenerInstalled: boolean;
  onEvent?: (event: { type: 'websocket' | 'webrtc' | 'media' | 'debugger-status'; data: unknown }) => void;
  OriginalWebSocket?: typeof WebSocket;
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: Record<string, unknown>;
    __INSPECTRA_AGENT__?: InspectraAgentGlobal;
  }
}

class RingBuffer<T> {
  #items: T[] = [];

  push(item: T) {
    this.#items.push(item);
    if (this.#items.length > MAX_EVENT_HISTORY) {
      this.#items.shift();
    }
  }

  toArray() {
    return [...this.#items];
  }
}

const getAgent = (): InspectraAgentGlobal => {
  if (!window.__INSPECTRA_AGENT__) {
    window.__INSPECTRA_AGENT__ = {
      state: { bootstrapped: false, hooksInstalled: false, sessionId: '' },
      webrtcBuffer: new RingBuffer<WebRtcEvent>(),
      websocketBuffer: new RingBuffer<WebSocketEvent>(),
      mediaPermissions: createDefaultMediaPermissionSnapshot(),
      websocketDebugger: { status: 'idle' },
      messageListenerInstalled: false
    };
  }
  return window.__INSPECTRA_AGENT__;
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `inspectra-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const isTopLevelWindow = () => {
  try {
    return window.top === window;
  } catch {
    return false;
  }
};

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const isBootstrapMessage = (
  value: unknown
): value is {
  channel: string;
  source: 'inspectra-content';
  type: 'agent:bootstrap';
  payload: { sessionId: string };
} =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-content' &&
  (value as { type?: string }).type === 'agent:bootstrap';

const isDebuggerWebSocketMessage = (
  value: unknown
): value is {
  channel: string;
  source: 'inspectra-content';
  type: 'websocket:debugger-event';
  payload: {
    requestId: string;
    phase:
      | 'created'
      | 'handshake-request'
      | 'open'
      | 'sent'
      | 'message'
      | 'error'
      | 'closed';
    url?: string;
    timestamp?: number;
    data: Record<string, unknown>;
  };
} =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-content' &&
  (value as { type?: string }).type === 'websocket:debugger-event';

const isDebuggerWebSocketStatusMessage = (
  value: unknown
): value is {
  channel: string;
  source: 'inspectra-content';
  type: 'websocket:debugger-status';
  payload: {
    status: 'idle' | 'attached' | 'detached' | 'error' | 'conflict';
    message?: string;
    ts?: number;
  };
} =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === BRIDGE_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-content' &&
  (value as { type?: string }).type === 'websocket:debugger-status';

const isAgentRelayMessage = (
  value: unknown
): value is {
  channel: string;
  source: 'inspectra-agent';
  payload: {
    webrtcEvent?: WebRtcEvent;
    websocketEvent?: WebSocketEvent;
  };
} =>
  typeof value === 'object' &&
  value !== null &&
  (value as { channel?: string }).channel === AGENT_RELAY_CHANNEL &&
  (value as { source?: string }).source === 'inspectra-agent';

const baseEvent = () => ({
  id: createId(),
  ts: Date.now(),
  sessionId: getAgent().state.sessionId,
  pageUrl: location.href
});

const syncRuntimeState = (next?: {
  webrtcEvent?: WebRtcEvent;
  websocketEvent?: WebSocketEvent;
  mediaPermissions?: MediaPermissionSnapshot;
  websocketDebugger?: WebSocketDebuggerState;
}) => {
  if (!isTopLevelWindow() && (next?.webrtcEvent || next?.websocketEvent)) {
    window.top?.postMessage(
      {
        channel: AGENT_RELAY_CHANNEL,
        source: 'inspectra-agent',
        payload: {
          webrtcEvent: next.webrtcEvent,
          websocketEvent: next.websocketEvent
        }
      },
      '*'
    );
    return;
  }

  const agent = getAgent();

  if (next?.webrtcEvent) {
    agent.webrtcBuffer.push(next.webrtcEvent);
  }

  if (next?.websocketEvent) {
    agent.websocketBuffer.push(next.websocketEvent);
  }

  if (next?.mediaPermissions) {
    agent.mediaPermissions = next.mediaPermissions;
  }

  if (next?.websocketDebugger) {
    agent.websocketDebugger = next.websocketDebugger;
  }

  const runtimeState: InspectraRuntimeState = {
    sessionId: agent.state.sessionId,
    webrtcEvents: agent.webrtcBuffer.toArray(),
    websocketEvents: agent.websocketBuffer.toArray(),
    mediaPermissions: agent.mediaPermissions,
    websocketDebugger: agent.websocketDebugger
  };
  window.__INSPECTRA_ERUDA_STATE__ = runtimeState as unknown as Record<string, unknown>;

  if (next?.webrtcEvent) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBRTC_EVENT));
  }

  if (next?.websocketEvent) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBSOCKET_EVENT));
  }

  if (next?.websocketDebugger) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBSOCKET_EVENT));
  }

  if (next?.mediaPermissions) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_MEDIA_PERMISSIONS_EVENT));
  }

  if (agent.onEvent) {
    if (next?.webrtcEvent) agent.onEvent({ type: 'webrtc', data: next.webrtcEvent });
    if (next?.websocketEvent) agent.onEvent({ type: 'websocket', data: next.websocketEvent });
    if (next?.mediaPermissions) agent.onEvent({ type: 'media', data: next.mediaPermissions });
    if (next?.websocketDebugger) agent.onEvent({ type: 'debugger-status', data: next.websocketDebugger });
  }
};

const normalizeStats = async (peer: RTCPeerConnection) => {
  const stats = await peer.getStats();
  const data: Record<string, unknown> = {};

  stats.forEach((report) => {
    if (
      report.type === 'candidate-pair' &&
      (report as unknown as { state?: string }).state === 'succeeded'
    ) {
      data.selectedCandidatePair = report.id;
      data.currentRoundTripTime = (
        report as unknown as { currentRoundTripTime?: number }
      ).currentRoundTripTime;
    }

    if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
      if ('packetsLost' in report) {
        data.packetsLost = report.packetsLost;
      }
      if ('jitter' in report) {
        data.jitter = report.jitter;
      }
      if ('framesDropped' in report) {
        data.framesDropped = (report as unknown as { framesDropped?: number }).framesDropped;
      }
      if ('framesPerSecond' in report) {
        data.framesPerSecond = (
          report as unknown as { framesPerSecond?: number }
        ).framesPerSecond;
      }
    }
  });

  data.connectionState = peer.connectionState;
  data.iceConnectionState = peer.iceConnectionState;
  data.signalingState = peer.signalingState;
  return data;
};

const normalizeProtocols = (value?: string | string[]) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const tryDecodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const printable = /^[\x20-\x7E\t\n\r]*$/.test(text) || /^[^\x00-\x08\x0E-\x1F]*$/.test(text);
    return printable ? text : null;
  } catch {
    return null;
  }
};

const toHexDump = (bytes: Uint8Array, maxBytes = 256): string => {
  const lines: string[] = [];
  const limit = Math.min(bytes.length, maxBytes);
  for (let offset = 0; offset < limit; offset += 16) {
    const chunk = bytes.slice(offset, Math.min(offset + 16, limit));
    const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk).map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset.toString(16).padStart(6, '0')}  ${hex.padEnd(48)}  ${ascii}`);
  }
  if (bytes.length > maxBytes) {
    lines.push(`... ${bytes.length - maxBytes} more bytes`);
  }
  return lines.join('\n');
};

const normalizeBinaryPayload = (bytes: Uint8Array, totalSize: number, typeName: string) => {
  const textContent = tryDecodeUtf8(bytes);
  return {
    size: totalSize,
    preview: textContent ? textContent.slice(0, 160) : `<${typeName} ${totalSize} bytes>`,
    payloadBase64: uint8ToBase64(bytes),
    payloadText: textContent ?? undefined,
    payloadHex: toHexDump(bytes),
    truncated: totalSize > MAX_BINARY_PAYLOAD_CAPTURE
  };
};

const normalizePayload = (value: unknown) => {
  if (typeof value === 'string') {
    const captured = value.length <= MAX_TEXT_PAYLOAD_CAPTURE;
    return {
      payloadType: 'text',
      size: value.length,
      preview: value.slice(0, 160),
      payload: captured ? value : value.slice(0, MAX_TEXT_PAYLOAD_CAPTURE),
      truncated: !captured
    };
  }

  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value.slice(0, MAX_BINARY_PAYLOAD_CAPTURE));
    return {
      payloadType: 'array-buffer',
      ...normalizeBinaryPayload(bytes, value.byteLength, 'ArrayBuffer')
    };
  }

  if (ArrayBuffer.isView(value)) {
    const slice = new Uint8Array(
      value.buffer,
      value.byteOffset,
      Math.min(value.byteLength, MAX_BINARY_PAYLOAD_CAPTURE)
    );
    return {
      payloadType: 'typed-array',
      ...normalizeBinaryPayload(slice, value.byteLength, value.constructor.name)
    };
  }

  if (value instanceof Blob) {
    return {
      payloadType: 'blob',
      size: value.size,
      mimeType: value.type || 'application/octet-stream',
      preview: `<Blob ${value.type || 'application/octet-stream'}>`
    };
  }

  return {
    payloadType: 'unknown',
    size: 0,
    preview: typeof value === 'undefined' ? 'undefined' : String(value)
  };
};

const emitDebuggerWebSocketEvent = (payload: {
  requestId: string;
  phase:
    | 'created'
    | 'handshake-request'
    | 'open'
    | 'sent'
    | 'message'
    | 'error'
    | 'closed';
  url?: string;
  timestamp?: number;
  data: Record<string, unknown>;
}) => {
  const event: WebSocketEvent = {
    ...baseEvent(),
    id: `${payload.requestId}:${payload.phase}:${payload.timestamp ?? Date.now()}`,
    ts: payload.timestamp ?? Date.now(),
    type: 'websocket',
    socketId: payload.requestId,
    phase: payload.phase,
    data: {
      source: 'debugger',
      url: payload.url,
      ...payload.data
    }
  };

  syncRuntimeState({ websocketEvent: event });
};

const syncDebuggerWebSocketStatus = (payload: {
  status: 'idle' | 'attached' | 'detached' | 'error' | 'conflict';
  message?: string;
  ts?: number;
}) => {
  syncRuntimeState({
    websocketDebugger: {
      status: payload.status,
      message: payload.message,
      lastUpdated: payload.ts ?? Date.now()
    }
  });
};

const installWebRtcHook = () => {
  if (!window.RTCPeerConnection) {
    syncRuntimeState();
    return;
  }

  const OriginalPeer = window.RTCPeerConnection;
  const WrappedPeer = function (
    this: RTCPeerConnection,
    configuration?: RTCConfiguration
  ) {
    const peer = new OriginalPeer(configuration);
    const peerId = createId();

    const emitPeer = (phase: WebRtcEvent['phase'], data: Record<string, unknown>) => {
      const event: WebRtcEvent = {
        ...baseEvent(),
        type: 'webrtc',
        peerId,
        phase,
        data
      };
      syncRuntimeState({ webrtcEvent: event });
    };

    emitPeer('created', {
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      signalingState: peer.signalingState
    });

    const emitState = () =>
      emitPeer('state-change', {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        signalingState: peer.signalingState
      });

    peer.addEventListener('connectionstatechange', emitState);
    peer.addEventListener('iceconnectionstatechange', emitState);
    peer.addEventListener('signalingstatechange', emitState);

    const interval = window.setInterval(async () => {
      if (peer.connectionState === 'closed') {
        return;
      }

      try {
        emitPeer('stats', await normalizeStats(peer));
      } catch {
        return;
      }
    }, 2000);

    const originalClose = peer.close.bind(peer);
    peer.close = () => {
      window.clearInterval(interval);
      emitPeer('closed', {
        connectionState: peer.connectionState
      });
      return originalClose();
    };

    return peer;
  } as unknown as typeof RTCPeerConnection;

  WrappedPeer.prototype = OriginalPeer.prototype;
  Object.setPrototypeOf(WrappedPeer, OriginalPeer);
  window.RTCPeerConnection = WrappedPeer;
};

const hasRequestedTrack = (
  constraint: MediaStreamConstraints['audio'] | MediaStreamConstraints['video']
) => !(constraint === false || typeof constraint === 'undefined');

const readPermissionState = async (
  name: 'camera' | 'microphone'
): Promise<MediaPermissionStateValue> => {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    return status.state;
  } catch {
    return 'unsupported';
  }
};

const readDeviceCounts = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return {
      audioInputs: 0,
      audioOutputs: 0,
      videoInputs: 0
    };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.reduce(
      (acc, device) => {
        switch (device.kind) {
          case 'audioinput':
            acc.audioInputs += 1;
            break;
          case 'audiooutput':
            acc.audioOutputs += 1;
            break;
          case 'videoinput':
            acc.videoInputs += 1;
            break;
          default:
            break;
        }

        return acc;
      },
      {
        audioInputs: 0,
        audioOutputs: 0,
        videoInputs: 0
      }
    );
  } catch {
    return {
      audioInputs: 0,
      audioOutputs: 0,
      videoInputs: 0
    };
  }
};

const refreshMediaPermissions = async (lastRequest?: MediaPermissionRequest) => {
  const [camera, microphone, devices] = await Promise.all([
    readPermissionState('camera'),
    readPermissionState('microphone'),
    readDeviceCounts()
  ]);

  syncRuntimeState({
    mediaPermissions: {
      secureContext: window.isSecureContext,
      permissionsApiSupported: typeof navigator !== 'undefined' && 'permissions' in navigator,
      camera,
      microphone,
      devices,
      lastUpdated: Date.now(),
      lastRequest: lastRequest ?? getAgent().mediaPermissions.lastRequest
    }
  });
};

const watchPermissionState = async (name: 'camera' | 'microphone') => {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return;
  }

  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    status.addEventListener?.('change', () => {
      void refreshMediaPermissions();
    });
  } catch {
    return;
  }
};

const installMediaPermissionHook = () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    void refreshMediaPermissions();
    return;
  }

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
    const request: MediaPermissionRequest = {
      ts: Date.now(),
      audio: hasRequestedTrack(constraints.audio),
      video: hasRequestedTrack(constraints.video),
      outcome: 'pending'
    };

    await refreshMediaPermissions(request);

    try {
      const stream = await originalGetUserMedia(constraints);
      await refreshMediaPermissions({
        ...request,
        outcome: 'granted'
      });
      return stream;
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : 'UnknownError';
      await refreshMediaPermissions({
        ...request,
        outcome:
          errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError'
            ? 'denied'
            : 'error',
        errorName,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  navigator.mediaDevices.addEventListener?.('devicechange', () => {
    void refreshMediaPermissions();
  });

  void watchPermissionState('camera');
  void watchPermissionState('microphone');
  void refreshMediaPermissions();
};

const installWebSocketHook = () => {
  if (!window.WebSocket) {
    syncRuntimeState();
    return;
  }

  if ((window.WebSocket as unknown as { __INSPECTRA_WRAPPED__?: boolean }).__INSPECTRA_WRAPPED__) {
    return;
  }

  const OriginalSocket = window.WebSocket;
  getAgent().OriginalWebSocket = OriginalSocket;
  class InspectraWebSocket extends OriginalSocket {
    static __INSPECTRA_WRAPPED__ = true;

    readonly inspectraSocketId: string;
    readonly inspectraSocketUrl: string;

    constructor(url: string | URL, protocols?: string | string[]) {
      if (typeof protocols === 'undefined') {
        super(String(url));
      } else {
        super(String(url), protocols);
      }
      this.inspectraSocketId = createId();
      this.inspectraSocketUrl = String(url);

      this.emitSocket('created', {
        url: this.inspectraSocketUrl,
        requestedProtocols: normalizeProtocols(protocols),
        readyState: this.readyState
      });

      this.addEventListener('open', () => {
        this.emitSocket('open', {
          url: this.url || this.inspectraSocketUrl,
          protocol: this.protocol,
          extensions: this.extensions,
          readyState: this.readyState
        });
      });

      this.addEventListener('message', (event) => {
        this.emitSocket('message', {
          direction: 'incoming',
          url: this.url || this.inspectraSocketUrl,
          protocol: this.protocol,
          readyState: this.readyState,
          ...normalizePayload(event.data)
        });
      });

      this.addEventListener('error', () => {
        this.emitSocket('error', {
          url: this.url || this.inspectraSocketUrl,
          protocol: this.protocol,
          readyState: this.readyState
        });
      });

      this.addEventListener('close', (event) => {
        this.emitSocket('closed', {
          url: this.url || this.inspectraSocketUrl,
          protocol: this.protocol,
          readyState: this.readyState,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
      });
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      this.emitSocket('sent', {
        direction: 'outgoing',
        url: this.url || this.inspectraSocketUrl,
        protocol: this.protocol,
        readyState: this.readyState,
        ...normalizePayload(data)
      });

      return super.send(data);
    }

    private emitSocket(phase: WebSocketEvent['phase'], data: Record<string, unknown>) {
      const event: WebSocketEvent = {
        ...baseEvent(),
        type: 'websocket',
        socketId: this.inspectraSocketId,
        phase,
        data
      };

      syncRuntimeState({ websocketEvent: event });
    }
  }

  window.WebSocket = InspectraWebSocket as typeof WebSocket;
};

const installHooks = () => {
  const agent = getAgent();
  if (agent.state.hooksInstalled) {
    return;
  }

  installWebRtcHook();
  installMediaPermissionHook();
  installWebSocketHook();
  agent.state.hooksInstalled = true;
};

const bootstrap = (sessionId: string) => {
  const agent = getAgent();
  agent.state.sessionId = sessionId;
  installHooks();
  syncRuntimeState({ mediaPermissions: agent.mediaPermissions });

  if (agent.state.bootstrapped) {
    return;
  }

  agent.state.bootstrapped = true;
};

const agent = getAgent();
if (!agent.messageListenerInstalled) {
  agent.messageListenerInstalled = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window && isAgentRelayMessage(event.data)) {
      syncRuntimeState(event.data.payload);
      return;
    }

    if (event.source === window && isDebuggerWebSocketMessage(event.data)) {
      emitDebuggerWebSocketEvent(event.data.payload);
      return;
    }

    if (event.source === window && isDebuggerWebSocketStatusMessage(event.data)) {
      syncDebuggerWebSocketStatus(event.data.payload);
      return;
    }

    if (event.source !== window || !isBootstrapMessage(event.data)) {
      return;
    }

    bootstrap(event.data.payload.sessionId);
  });
}

export const bootstrapInspectraAgent = () => {
  installHooks();
  syncRuntimeState({ mediaPermissions: getAgent().mediaPermissions });
};
