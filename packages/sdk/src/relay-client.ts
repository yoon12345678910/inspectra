export interface RelayMessage {
  type: 'join' | 'event' | 'peer-count';
  room?: string;
  kind?:
    | 'websocket'
    | 'webrtc'
    | 'media'
    | 'debugger-status'
    | 'remote-command'
    | 'remote-response'
    | 'device-info'
    | 'console-stream';
  payload?: unknown;
  count?: number;
}

export interface RelayClientOptions {
  url: string;
  room: string;
  onEvent?: (msg: RelayMessage) => void;
  onPeerCount?: (count: number) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const RETRY_MULTIPLIER = 2;

export class RelayClient {
  private ws: WebSocket | null = null;
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly opts: RelayClientOptions;

  constructor(opts: RelayClientOptions) {
    this.opts = opts;
    this.connect();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    if (this.destroyed) return;

    this.opts.onStatusChange?.('connecting');

    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.retryMs = INITIAL_RETRY_MS;
      this.opts.onStatusChange?.('connected');
      this.send({ type: 'join', room: this.opts.room });
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg: RelayMessage = JSON.parse(String(event.data));
        if (msg.type === 'peer-count' && typeof msg.count === 'number') {
          this.opts.onPeerCount?.(msg.count);
        } else if (msg.type === 'event') {
          this.opts.onEvent?.(msg);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener('close', () => {
      this.opts.onStatusChange?.('disconnected');
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close event will fire after this, triggering reconnect
    });
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.retryTimer = setTimeout(() => {
      this.retryMs = Math.min(this.retryMs * RETRY_MULTIPLIER, MAX_RETRY_MS);
      this.connect();
    }, this.retryMs);
  }

  send(msg: RelayMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendEvent(kind: RelayMessage['kind'], payload: unknown) {
    this.send({ type: 'event', kind, payload });
  }

  changeRoom(room: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'join', room });
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }
}
