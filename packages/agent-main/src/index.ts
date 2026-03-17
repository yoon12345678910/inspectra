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

const BRIDGE_CHANNEL = 'inspectra:bridge';

interface AgentState {
  bootstrapped: boolean;
  sessionId: string;
}

interface InspectraRuntimeState
  extends InspectraMediaPermissionsState {
  webrtcEvents: WebRtcEvent[];
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

const webrtcBuffer = new RingBuffer<WebRtcEvent>();
let mediaPermissions = createDefaultMediaPermissionSnapshot();

const baseEvent = () => ({
  id: createId(),
  ts: Date.now(),
  sessionId: state.sessionId,
  pageUrl: location.href
});

const syncRuntimeState = (next?: {
  webrtcEvent?: WebRtcEvent;
  mediaPermissions?: MediaPermissionSnapshot;
}) => {
  if (next?.webrtcEvent) {
    webrtcBuffer.push(next.webrtcEvent);
  }

  if (next?.mediaPermissions) {
    mediaPermissions = next.mediaPermissions;
  }

  const runtimeState: InspectraRuntimeState = {
    sessionId: state.sessionId,
    webrtcEvents: webrtcBuffer.toArray(),
    mediaPermissions
  };
  window.__INSPECTRA_ERUDA_STATE__ = runtimeState as unknown as Record<string, unknown>;

  if (next?.webrtcEvent) {
    window.dispatchEvent(new CustomEvent(INSPECTRA_WEBRTC_EVENT));
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

const hasRequestedTrack = (constraint: MediaStreamConstraints['audio'] | MediaStreamConstraints['video']) =>
  !(constraint === false || typeof constraint === 'undefined');

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

  void refreshMediaPermissions();
};

const bootstrap = (sessionId: string) => {
  state.sessionId = sessionId;
  syncRuntimeState({ mediaPermissions });

  if (state.bootstrapped) {
    return;
  }

  installWebRtcHook();
  installMediaPermissionHook();
  state.bootstrapped = true;
};

window.addEventListener('message', (event) => {
  if (event.source !== window || !isBootstrapMessage(event.data)) {
    return;
  }

  bootstrap(event.data.payload.sessionId);
});

export const bootstrapInspectraAgent = () => undefined;
