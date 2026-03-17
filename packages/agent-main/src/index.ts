import { createBatcher, isInspectraContentMessage, postToContent } from '@inspectra/bridge';
import {
  DEFAULT_BATCH_FLUSH_MS,
  HIGHLIGHT_BOX_ID,
  OVERLAY_ROOT_ATTR,
  createId,
  defaultSettings,
  redactHeaders,
  redactJsonPreview,
  safeSerialize,
  type DebugEvent,
  type InspectEvent,
  type NetworkHttpEvent,
  type NetworkWebSocketEvent,
  type OverlaySettings,
  type PerfEvent,
  type RuntimeErrorEvent,
  type StorageSnapshotEvent,
  type WebRtcEvent
} from '@inspectra/core';

interface AgentState {
  bootstrapped: boolean;
  sessionId: string;
  settings: OverlaySettings;
  emit: (event: DebugEvent) => void;
  flush: () => void;
  inspectCleanup?: () => void;
  highlighted?: HTMLElement;
}

const state: AgentState = {
  bootstrapped: false,
  sessionId: '',
  settings: defaultSettings(),
  emit: () => undefined,
  flush: () => undefined
};

const httpRequestMap = new WeakMap<
  XMLHttpRequest,
  {
    method: string;
    url: string;
    startedAt: number;
    requestHeaders: Record<string, string>;
    requestBodyPreview?: string;
  }
>();

const baseEvent = <TType extends DebugEvent['type']>(type: TType) => ({
  id: createId(),
  type,
  ts: Date.now(),
  sessionId: state.sessionId,
  pageUrl: location.href
});

const emitRuntimeError = (
  payload: Omit<
    RuntimeErrorEvent,
    'id' | 'type' | 'ts' | 'sessionId' | 'pageUrl' | 'tabId'
  >
) =>
  state.emit({
    ...baseEvent('runtime-error'),
    ...payload
  });

const emitPerf = (metric: PerfEvent['metric'], data: Record<string, unknown>) =>
  state.emit({
    ...baseEvent('perf'),
    metric,
    data
  });

const emitStorageSnapshot = async () => {
  const indexedDbNames =
    typeof indexedDB !== 'undefined' && 'databases' in indexedDB
      ? await indexedDB
          .databases()
          .then((items) =>
            items.map((item) => item.name).filter((value): value is string => Boolean(value))
          )
          .catch(() => [])
      : [];

  const payload: StorageSnapshotEvent = {
    ...baseEvent('storage-snapshot'),
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
    cookieKeys: document.cookie
      .split(';')
      .map((item) => item.trim().split('=')[0])
      .filter(Boolean),
    indexedDbNames,
    envSummary: {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      dpr: window.devicePixelRatio,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: navigator.onLine,
      visibilityState: document.visibilityState
    }
  };

  state.emit(payload);
};

const getTextPreview = (value: unknown, limit: number) => {
  if (typeof value === 'string') {
    return redactJsonPreview(value, state.settings.redactionEnabled, limit);
  }

  if (value instanceof URLSearchParams) {
    return redactJsonPreview(value.toString(), state.settings.redactionEnabled, limit);
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return redactJsonPreview(
        JSON.stringify(value),
        state.settings.redactionEnabled,
        limit
      );
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const headersToObject = (headers?: Headers | Record<string, string>) => {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return redactHeaders(Object.fromEntries(headers.entries()));
  }

  return redactHeaders(headers);
};

const installConsoleHooks = () => {
  const levels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = [
    'log',
    'info',
    'warn',
    'error',
    'debug'
  ];

  for (const level of levels) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      state.emit({
        ...baseEvent('console'),
        level,
        args: args.map((arg) => safeSerialize(arg))
      });
      original.apply(console, args);
    };
  }
};

const installErrorHooks = () => {
  window.addEventListener('error', (event) => {
    emitRuntimeError({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      kind: 'error'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    emitRuntimeError({
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection',
      stack: reason instanceof Error ? reason.stack : undefined,
      kind: 'unhandledrejection'
    });
  });
};

const installFetchHook = () => {
  if (!window.fetch) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now();
    const request = input instanceof Request ? input : new Request(input, init);
    const requestBodyPreview = state.settings.captureNetworkBodies
      ? getTextPreview(init?.body, state.settings.maxBodyPreviewBytes)
      : undefined;

    try {
      const response = await originalFetch(input, init);
      const responseBodyPreview =
        state.settings.captureNetworkBodies &&
        /json|text|xml|javascript|x-www-form-urlencoded/i.test(
          response.headers.get('content-type') ?? ''
        )
          ? redactJsonPreview(
              await response.clone().text(),
              state.settings.redactionEnabled,
              state.settings.maxBodyPreviewBytes
            )
          : undefined;

      const event: NetworkHttpEvent = {
        ...baseEvent('network-http'),
        requestId: createId(),
        transport: 'fetch',
        method: request.method,
        url: request.url,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        ok: response.ok,
        requestHeaders: headersToObject(request.headers),
        responseHeaders: headersToObject(response.headers),
        requestBodyPreview:
          typeof requestBodyPreview === 'string' ? requestBodyPreview : undefined,
        responseBodyPreview
      };
      state.emit(event);
      return response;
    } catch (error) {
      const event: NetworkHttpEvent = {
        ...baseEvent('network-http'),
        requestId: createId(),
        transport: 'fetch',
        method: request.method,
        url: request.url,
        durationMs: Math.round(performance.now() - startedAt),
        ok: false,
        requestHeaders: headersToObject(request.headers),
        requestBodyPreview:
          typeof requestBodyPreview === 'string' ? requestBodyPreview : undefined,
        errorReason: error instanceof Error ? error.message : String(error)
      };
      state.emit(event);
      throw error;
    }
  };
};

const installXhrHook = () => {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    httpRequestMap.set(this, {
      method,
      url: String(url),
      startedAt: performance.now(),
      requestHeaders: {}
    });
    return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(name: string, value: string) {
    const metadata = httpRequestMap.get(this);
    if (metadata) {
      metadata.requestHeaders[name] = value;
    }
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    const metadata = httpRequestMap.get(this);
    if (metadata && state.settings.captureNetworkBodies) {
      metadata.requestBodyPreview = getTextPreview(body, state.settings.maxBodyPreviewBytes);
    }

    const finalize = () => {
      const request = httpRequestMap.get(this);
      if (!request) {
        return;
      }
      const responseBodyPreview =
        state.settings.captureNetworkBodies &&
        typeof this.responseText === 'string' &&
        /json|text|xml|javascript/i.test(this.getResponseHeader('content-type') ?? '')
          ? redactJsonPreview(
              this.responseText,
              state.settings.redactionEnabled,
              state.settings.maxBodyPreviewBytes
            )
          : undefined;

      const headers = this.getAllResponseHeaders()
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, ...parts] = line.split(':');
          return [name.trim(), parts.join(':').trim()];
        });

      state.emit({
        ...baseEvent('network-http'),
        requestId: createId(),
        transport: 'xhr',
        method: request.method,
        url: request.url,
        status: this.status,
        durationMs: Math.round(performance.now() - request.startedAt),
        ok: this.status >= 200 && this.status < 400,
        requestHeaders: redactHeaders(request.requestHeaders),
        responseHeaders: redactHeaders(Object.fromEntries(headers)),
        requestBodyPreview: request.requestBodyPreview,
        responseBodyPreview
      });
      this.removeEventListener('loadend', finalize);
    };

    this.addEventListener('loadend', finalize);
    return originalSend.call(this, body ?? null);
  };
};

const byteLengthForMessage = (value: unknown) => {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value).byteLength;
  }

  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }

  if (value instanceof Blob) {
    return value.size;
  }

  return undefined;
};

const installWebSocketHook = () => {
  if (!window.WebSocket) {
    return;
  }

  const OriginalWebSocket = window.WebSocket;
  const WrappedWebSocket = function (
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ) {
    const ws =
      protocols === undefined
        ? new OriginalWebSocket(url)
        : new OriginalWebSocket(url, protocols);

    const connectionId = createId();
    const emitWs = (phase: NetworkWebSocketEvent['phase'], payload: Partial<NetworkWebSocketEvent>) =>
      state.emit({
        ...baseEvent('network-ws'),
        connectionId,
        url: String(url),
        phase,
        ...payload
      });

    ws.addEventListener('open', () => emitWs('open', {}));
    ws.addEventListener('error', () => emitWs('error', {}));
    ws.addEventListener('close', (event) =>
      emitWs('close', {
        closeCode: event.code,
        closeReason: event.reason
      })
    );
    ws.addEventListener('message', (event) =>
      emitWs('message', {
        preview:
          state.settings.captureWebSocketPayloads && typeof event.data === 'string'
            ? redactJsonPreview(
                event.data,
                state.settings.redactionEnabled,
                state.settings.maxWsPreviewBytes
              )
            : undefined,
        byteLength: byteLengthForMessage(event.data)
      })
    );

    const originalSend = ws.send.bind(ws);
    ws.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      emitWs('send', {
        preview:
          state.settings.captureWebSocketPayloads && typeof data === 'string'
            ? redactJsonPreview(
                data,
                state.settings.redactionEnabled,
                state.settings.maxWsPreviewBytes
              )
            : undefined,
        byteLength: byteLengthForMessage(data)
      });
      return originalSend(data);
    };

    return ws;
  } as unknown as typeof WebSocket;

  WrappedWebSocket.prototype = OriginalWebSocket.prototype;
  Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
  window.WebSocket = WrappedWebSocket;
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
      data.currentRoundTripTime = (report as unknown as { currentRoundTripTime?: number }).currentRoundTripTime;
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
        data.framesPerSecond = (report as unknown as { framesPerSecond?: number }).framesPerSecond;
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
    return;
  }

  const OriginalPeer = window.RTCPeerConnection;
  const WrappedPeer = function (
    this: RTCPeerConnection,
    configuration?: RTCConfiguration
  ) {
    const peer = new OriginalPeer(configuration);
    const peerId = createId();

    const emitPeer = (phase: WebRtcEvent['phase'], data: Record<string, unknown>) =>
      state.emit({
        ...baseEvent('webrtc'),
        peerId,
        phase,
        data
      });

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

const installPerformanceHooks = () => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation) {
    emitPerf('navigation', {
      domContentLoaded: navigation.domContentLoadedEventEnd,
      loadEventEnd: navigation.loadEventEnd,
      responseStart: navigation.responseStart,
      responseEnd: navigation.responseEnd
    });
  }

  const resources = performance
    .getEntriesByType('resource')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10)
    .map((entry) => ({
      name: entry.name,
      duration: entry.duration,
      initiatorType: (entry as PerformanceResourceTiming).initiatorType
    }));

  if (resources.length > 0) {
    emitPerf('resource', { slowest: resources });
  }

  if (typeof PerformanceObserver !== 'undefined') {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        emitPerf('longtask', {
          duration: entry.duration,
          name: entry.name,
          startTime: entry.startTime
        });
      }
    });

    try {
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      // Browsers without Long Tasks support still use the other performance probes.
    }
  }

  let previousFrame = performance.now();
  let rafCount = 0;
  let rafSamples: number[] = [];
  const sampleFrames = () => {
    const now = performance.now();
    rafSamples.push(now - previousFrame - 16.7);
    previousFrame = now;
    rafCount += 1;

    if (rafCount >= 30) {
      const sorted = [...rafSamples].sort((a, b) => a - b);
      emitPerf('frame-delay', {
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0
      });
      rafCount = 0;
      rafSamples = [];
    }

    requestAnimationFrame(sampleFrames);
  };
  requestAnimationFrame(sampleFrames);

  let lastTick = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    emitPerf('event-loop-lag', {
      driftMs: Math.max(0, now - lastTick - 1000)
    });
    lastTick = now;
  }, 1000);
};

const buildSelector = (element: Element) => {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes =
    element.classList.length > 0 ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : '';
  return `${tag}${id}${classes}`;
};

const buildDomPath = (element: Element) => {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && segments.length < 6) {
    segments.unshift(buildSelector(current));
    current = current.parentElement;
  }
  return segments.join(' > ');
};

const getBoxModel = (element: Element) => {
  const style = window.getComputedStyle(element);
  const readSides = (prefix: string) => [
    Number.parseFloat(style.getPropertyValue(`${prefix}-top`)) || 0,
    Number.parseFloat(style.getPropertyValue(`${prefix}-right`)) || 0,
    Number.parseFloat(style.getPropertyValue(`${prefix}-bottom`)) || 0,
    Number.parseFloat(style.getPropertyValue(`${prefix}-left`)) || 0
  ];

  return {
    margin: readSides('margin'),
    border: readSides('border-width'),
    padding: readSides('padding')
  };
};

const pickComputedStyle = (element: Element) => {
  const computed = window.getComputedStyle(element);
  const keys = [
    'display',
    'position',
    'z-index',
    'width',
    'height',
    'margin',
    'padding',
    'color',
    'background-color',
    'font-size',
    'line-height'
  ];
  return Object.fromEntries(keys.map((key) => [key, computed.getPropertyValue(key)]));
};

const isOverlayTarget = (event: Event) =>
  event
    .composedPath()
    .some(
      (entry) =>
        entry instanceof HTMLElement &&
        (entry.hasAttribute(OVERLAY_ROOT_ATTR) || entry.id === HIGHLIGHT_BOX_ID)
    );

const ensureHighlightBox = () => {
  let box = document.getElementById(HIGHLIGHT_BOX_ID) as HTMLElement | null;
  if (!box) {
    box = document.createElement('div');
    box.id = HIGHLIGHT_BOX_ID;
    Object.assign(box.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px solid #ff6a3d',
      background: 'rgba(255, 106, 61, 0.12)',
      boxSizing: 'border-box',
      display: 'none'
    });
    document.documentElement.append(box);
  }
  return box;
};

const emitInspectEvent = (action: InspectEvent['action'], element: Element) => {
  const rect = element.getBoundingClientRect();
  state.emit({
    ...baseEvent('inspect'),
    action,
    selector: buildSelector(element),
    domPath: buildDomPath(element),
    tagName: element.tagName.toLowerCase(),
    idValue: element.id || undefined,
    classList: element.classList.length > 0 ? Array.from(element.classList) : undefined,
    textPreview: redactJsonPreview(
      element.textContent?.trim() ?? '',
      state.settings.redactionEnabled,
      120
    ),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    boxModel: getBoxModel(element),
    computedStyleSummary: pickComputedStyle(element)
  });
};

const setInspectActive = (active: boolean) => {
  state.inspectCleanup?.();
  state.inspectCleanup = undefined;

  const box = ensureHighlightBox();
  box.style.display = 'none';

  if (!active) {
    return;
  }

  const handleMove = (event: MouseEvent) => {
    if (isOverlayTarget(event)) {
      box.style.display = 'none';
      return;
    }

    const target =
      event.target instanceof Element
        ? event.target
        : document.elementFromPoint(event.clientX, event.clientY);
    if (!target) {
      box.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    emitInspectEvent('hover', target);
  };

  const handleClick = (event: MouseEvent) => {
    if (isOverlayTarget(event)) {
      return;
    }
    const target =
      event.target instanceof Element
        ? event.target
        : document.elementFromPoint(event.clientX, event.clientY);
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    emitInspectEvent('select', target);
    setInspectActive(false);
  };

  window.addEventListener('mousemove', handleMove, true);
  window.addEventListener('click', handleClick, true);

  state.inspectCleanup = () => {
    window.removeEventListener('mousemove', handleMove, true);
    window.removeEventListener('click', handleClick, true);
    box.style.display = 'none';
  };
};

const bootstrap = (sessionId: string, settings: OverlaySettings) => {
  state.sessionId = sessionId;
  state.settings = settings;

  if (state.bootstrapped) {
    emitStorageSnapshot();
    return;
  }

  const batcher = createBatcher<DebugEvent>((events) => {
    postToContent({
      type: 'agent:events',
      payload: { events }
    });
  }, DEFAULT_BATCH_FLUSH_MS);

  state.emit = (event) => batcher.push(event);
  state.flush = () => batcher.flush();

  installConsoleHooks();
  installErrorHooks();
  installFetchHook();
  installXhrHook();
  installWebSocketHook();
  installPerformanceHooks();
  installWebRtcHook();
  emitStorageSnapshot();

  state.bootstrapped = true;
  postToContent({
    type: 'agent:status',
    payload: { bootstrapped: true }
  });
};

window.addEventListener('message', (event) => {
  if (event.source !== window || !isInspectraContentMessage(event.data)) {
    return;
  }

  switch (event.data.type) {
    case 'agent:bootstrap':
      bootstrap(event.data.payload.sessionId, event.data.payload.settings);
      break;
    case 'inspect:set-active':
      setInspectActive(event.data.payload.active);
      break;
    case 'settings:update':
      state.settings = event.data.payload;
      break;
    case 'storage:snapshot:request':
      emitStorageSnapshot();
      break;
    default:
      break;
  }
});

export const bootstrapInspectraAgent = () => undefined;
