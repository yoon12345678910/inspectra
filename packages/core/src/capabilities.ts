export interface RuntimeCapabilities {
  consoleHook: boolean;
  errorHook: boolean;
  elementInspector: boolean;
  networkHttp: boolean;
  networkWebSocket: boolean;
  longTask: boolean;
  webRtcStats: boolean;
  storageSnapshot: boolean;
  chromiumDeepMode: boolean;
  devtoolsPanel: boolean;
  sameOriginIframeInspect: boolean;
}

export const defaultCapabilities = (): RuntimeCapabilities => ({
  consoleHook: true,
  errorHook: true,
  elementInspector: true,
  networkHttp: true,
  networkWebSocket: typeof WebSocket !== 'undefined',
  longTask: typeof PerformanceObserver !== 'undefined',
  webRtcStats: typeof RTCPeerConnection !== 'undefined',
  storageSnapshot: true,
  chromiumDeepMode: false,
  devtoolsPanel: false,
  sameOriginIframeInspect: false
});

