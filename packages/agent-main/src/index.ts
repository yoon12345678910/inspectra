import {
  INSPECTRA_WEBRTC_EVENT,
  type InspectraErudaState,
  type WebRtcEvent
} from '@inspectra/eruda-plugin-webrtc';

const BRIDGE_CHANNEL = 'inspectra:bridge';

interface AgentState {
  bootstrapped: boolean;
  sessionId: string;
}

declare global {
  interface Window {
    __INSPECTRA_ERUDA_STATE__?: InspectraErudaState;
  }
}

class RingBuffer<T> {
  #capacity: number;
  #items: T[] = [];

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  push(item: T) {
    if (this.#items.length >= this.#capacity) {
      this.#items.shift();
    }
    this.#items.push(item);
  }

  toArray() {
    return [...this.#items];
  }
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `inspectra-${Math.random().toString(36).slice(2)}-${Date.now()}`;

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

const state: AgentState = {
  bootstrapped: false,
  sessionId: ''
};

const webrtcBuffer = new RingBuffer<WebRtcEvent>(50);

const baseEvent = () => ({
  id: createId(),
  ts: Date.now(),
  sessionId: state.sessionId,
  pageUrl: location.href
});

const syncRuntimeState = (event?: WebRtcEvent) => {
  if (event) {
    webrtcBuffer.push(event);
  }

  window.__INSPECTRA_ERUDA_STATE__ = {
    sessionId: state.sessionId,
    webrtcEvents: webrtcBuffer.toArray()
  };

  window.dispatchEvent(new CustomEvent(INSPECTRA_WEBRTC_EVENT));
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
      syncRuntimeState(event);
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

const bootstrap = (sessionId: string) => {
  state.sessionId = sessionId;
  syncRuntimeState();

  if (state.bootstrapped) {
    return;
  }

  installWebRtcHook();
  state.bootstrapped = true;
};

window.addEventListener('message', (event) => {
  if (event.source !== window || !isBootstrapMessage(event.data)) {
    return;
  }

  bootstrap(event.data.payload.sessionId);
});

export const bootstrapInspectraAgent = () => undefined;
