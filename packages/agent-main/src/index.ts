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
  type WebSocketEvent
} from '@inspectra/eruda-plugin-websocket';

const BRIDGE_CHANNEL = 'inspectra:bridge';
const AGENT_RELAY_CHANNEL = 'inspectra:agent-relay';
const MAX_EVENT_HISTORY = 200;

interface AgentState {
  bootstrapped: boolean;
  hooksInstalled: boolean;
  sessionId: string;
}

interface InspectraRuntimeState extends InspectraMediaPermissionsState {
  webrtcEvents: WebRtcEvent[];
  websocketEvents: WebSocketEvent[];
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: Record<string, unknown>;
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

const state: AgentState = {
  bootstrapped: false,
  hooksInstalled: false,
  sessionId: ''
};

const webrtcBuffer = new RingBuffer<WebRtcEvent>();
const websocketBuffer = new RingBuffer<WebSocketEvent>();
let mediaPermissions = createDefaultMediaPermissionSnapshot();

const baseEvent = () => ({
  id: createId(),
  ts: Date.now(),
  sessionId: state.sessionId,
  pageUrl: location.href
});

const syncRuntimeState = (next?: {
  webrtcEvent?: WebRtcEvent;
  websocketEvent?: WebSocketEvent;
  mediaPermissions?: MediaPermissionSnapshot;
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

  if (next?.webrtcEvent) {
    webrtcBuffer.push(next.webrtcEvent);
  }

  if (next?.websocketEvent) {
    websocketBuffer.push(next.websocketEvent);
  }

  if (next?.mediaPermissions) {
    mediaPermissions = next.mediaPermissions;
  }

  const runtimeState: InspectraRuntimeState = {
    sessionId: state.sessionId,
    webrtcEvents: webrtcBuffer.toArray(),
    websocketEvents: websocketBuffer.toArray(),
    mediaPermissions
  };
  window.__INSPECTRA_ERUDA_STATE__ = runtimeState as unknown as Record<string, unknown>;

  if (next?.webrtcEvent) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBRTC_EVENT));
  }

  if (next?.websocketEvent) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBSOCKET_EVENT));
  }

  if (next?.mediaPermissions) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_MEDIA_PERMISSIONS_EVENT));
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

const normalizePayload = (value: unknown) => {
  if (typeof value === 'string') {
    return {
      payloadType: 'text',
      size: value.length,
      preview: value.slice(0, 160)
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

  if (value instanceof ArrayBuffer) {
    return {
      payloadType: 'array-buffer',
      size: value.byteLength,
      preview: `<ArrayBuffer ${value.byteLength} bytes>`
    };
  }

  if (ArrayBuffer.isView(value)) {
    return {
      payloadType: 'typed-array',
      size: value.byteLength,
      preview: `<${value.constructor.name} ${value.byteLength} bytes>`
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
    phase:
      payload.phase === 'handshake-request'
        ? 'created'
        : payload.phase,
    data: {
      source: 'debugger',
      url: payload.url,
      ...payload.data
    }
  };

  syncRuntimeState({ websocketEvent: event });
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
      lastRequest: lastRequest ?? mediaPermissions.lastRequest
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

  const OriginalSocket = window.WebSocket;
  class InspectraWebSocket extends OriginalSocket {
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
  if (state.hooksInstalled) {
    return;
  }

  installWebRtcHook();
  installMediaPermissionHook();
  installWebSocketHook();
  state.hooksInstalled = true;
};

const bootstrap = (sessionId: string) => {
  state.sessionId = sessionId;
  installHooks();
  syncRuntimeState({ mediaPermissions });

  if (state.bootstrapped) {
    return;
  }

  state.bootstrapped = true;
};

window.addEventListener('message', (event) => {
  if (event.source !== window && isAgentRelayMessage(event.data)) {
    syncRuntimeState(event.data.payload);
    return;
  }

  if (event.source === window && isDebuggerWebSocketMessage(event.data)) {
    emitDebuggerWebSocketEvent(event.data.payload);
    return;
  }

  if (event.source !== window || !isBootstrapMessage(event.data)) {
    return;
  }

  bootstrap(event.data.payload.sessionId);
});

export const bootstrapInspectraAgent = () => {
  installHooks();
  syncRuntimeState({ mediaPermissions });
};
