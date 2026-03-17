export type SerializedPrimitive = string | number | boolean | null;
export type SerializedValue =
  | SerializedPrimitive
  | SerializedValue[]
  | { [key: string]: SerializedValue };

export interface BaseEvent {
  id: string;
  type: string;
  ts: number;
  sessionId: string;
  pageUrl: string;
  tabId?: number;
}

export interface ConsoleEvent extends BaseEvent {
  type: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: SerializedValue[];
}

export interface RuntimeErrorEvent extends BaseEvent {
  type: 'runtime-error';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  kind: 'error' | 'unhandledrejection';
}

export interface InspectEvent extends BaseEvent {
  type: 'inspect';
  action: 'hover' | 'select';
  selector?: string;
  domPath?: string;
  tagName: string;
  idValue?: string;
  classList?: string[];
  textPreview?: string;
  rect: { x: number; y: number; width: number; height: number };
  boxModel?: {
    margin: number[];
    border: number[];
    padding: number[];
  };
  computedStyleSummary?: Record<string, string>;
}

export interface NetworkHttpEvent extends BaseEvent {
  type: 'network-http';
  requestId: string;
  transport: 'fetch' | 'xhr';
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  ok?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  errorReason?: string;
}

export interface NetworkWebSocketEvent extends BaseEvent {
  type: 'network-ws';
  connectionId: string;
  url: string;
  phase: 'open' | 'send' | 'message' | 'error' | 'close';
  preview?: string;
  byteLength?: number;
  closeCode?: number;
  closeReason?: string;
}

export interface PerfEvent extends BaseEvent {
  type: 'perf';
  metric:
    | 'navigation'
    | 'resource'
    | 'longtask'
    | 'frame-delay'
    | 'event-loop-lag';
  data: Record<string, unknown>;
}

export interface WebRtcEvent extends BaseEvent {
  type: 'webrtc';
  peerId: string;
  phase: 'created' | 'state-change' | 'stats' | 'closed';
  data: Record<string, unknown>;
}

export interface StorageSnapshotEvent extends BaseEvent {
  type: 'storage-snapshot';
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  cookieKeys: string[];
  indexedDbNames: string[];
  envSummary: Record<string, unknown>;
}

export type DebugEvent =
  | ConsoleEvent
  | RuntimeErrorEvent
  | InspectEvent
  | NetworkHttpEvent
  | NetworkWebSocketEvent
  | PerfEvent
  | WebRtcEvent
  | StorageSnapshotEvent;

