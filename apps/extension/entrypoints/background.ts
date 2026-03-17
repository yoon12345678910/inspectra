import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';
const REGISTER_DEBUGGER_MESSAGE = 'inspectra:register-debugger-target';
const WEBSOCKET_DEBUGGER_EVENT = 'inspectra:websocket-debugger-event';
const DEBUGGER_VERSION = '1.3';

type DebuggeeTarget = {
  tabId: number;
};

type DebuggerEventMethod =
  | 'Network.webSocketCreated'
  | 'Network.webSocketWillSendHandshakeRequest'
  | 'Network.webSocketHandshakeResponseReceived'
  | 'Network.webSocketFrameSent'
  | 'Network.webSocketFrameReceived'
  | 'Network.webSocketFrameError'
  | 'Network.webSocketClosed';

type DebuggerWebSocketPayload = {
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

type ChromeDebuggerApi = {
  attach(target: DebuggeeTarget, version: string): Promise<void>;
  sendCommand(target: DebuggeeTarget, method: string): Promise<unknown>;
  onEvent: {
    addListener(
      callback: (source: DebuggeeTarget, method: string, params?: unknown) => void
    ): void;
  };
  onDetach: {
    addListener(callback: (source: DebuggeeTarget, reason: string) => void): void;
  };
};

declare const chrome: {
  debugger: ChromeDebuggerApi;
};

const attachedTabs = new Set<number>();
const websocketUrls = new Map<string, string>();

const getSocketKey = (tabId: number, requestId: string) => `${tabId}:${requestId}`;

const toTarget = (tabId: number): DebuggeeTarget => ({ tabId });

const formatWsMessage = (
  payloadData?: string,
  opcode?: number,
  mask?: boolean
) => ({
  payloadType: opcode === 2 ? 'binary' : 'text',
  preview: payloadData ? payloadData.slice(0, 160) : '',
  size: payloadData?.length ?? 0,
  opcode,
  mask: typeof mask === 'boolean' ? mask : undefined
});

const sendWebSocketEvent = async (tabId: number, payload: DebuggerWebSocketPayload) => {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: WEBSOCKET_DEBUGGER_EVENT,
      payload
    });
  } catch {
    return;
  }
};

const attachDebugger = async (tabId: number) => {
  if (attachedTabs.has(tabId)) {
    return;
  }

  const target = toTarget(tabId);

  try {
    await chrome.debugger.attach(target, DEBUGGER_VERSION);
    await chrome.debugger.sendCommand(target, 'Network.enable');
    attachedTabs.add(tabId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Another debugger is already attached')) {
      console.warn('Inspectra could not attach debugger for WebSocket capture.', error);
    }
  }
};

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
      return;
    }

    try {
      await attachDebugger(tab.id);
      await browser.tabs.sendMessage(tab.id, {
        type: TOGGLE_MESSAGE
      });
    } catch (error) {
      console.warn('Inspectra could not reach the content script for this tab.', error);
    }
  });

  browser.runtime.onMessage.addListener((message: { type?: string }, sender) => {
    if (message?.type !== REGISTER_DEBUGGER_MESSAGE || !sender.tab?.id) {
      return;
    }

    void attachDebugger(sender.tab.id);
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId) {
      return;
    }

    switch (method as DebuggerEventMethod) {
      case 'Network.webSocketCreated': {
        const requestId = String((params as { requestId: string }).requestId);
        const url = (params as { url?: string }).url;
        if (url) {
          websocketUrls.set(getSocketKey(tabId, requestId), url);
        }
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: 'created',
          url,
          timestamp: Date.now(),
          data: { url }
        });
        break;
      }
      case 'Network.webSocketWillSendHandshakeRequest': {
        const requestId = String((params as { requestId: string }).requestId);
        const request = (params as { request?: Record<string, unknown> }).request ?? {};
        const wallTime = (params as { wallTime?: number }).wallTime;
        const url = websocketUrls.get(getSocketKey(tabId, requestId));
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: 'handshake-request',
          url,
          timestamp: wallTime ? Math.round(wallTime * 1000) : Date.now(),
          data: {
            url,
            headers: request
          }
        });
        break;
      }
      case 'Network.webSocketHandshakeResponseReceived': {
        const requestId = String((params as { requestId: string }).requestId);
        const response =
          (params as { response?: Record<string, unknown> }).response ?? {};
        const url = websocketUrls.get(getSocketKey(tabId, requestId));
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: 'open',
          url,
          timestamp: Date.now(),
          data: {
            url,
            response
          }
        });
        break;
      }
      case 'Network.webSocketFrameSent':
      case 'Network.webSocketFrameReceived': {
        const requestId = String((params as { requestId: string }).requestId);
        const response =
          (params as { response?: { opcode?: number; mask?: boolean; payloadData?: string } })
            .response ?? {};
        const url = websocketUrls.get(getSocketKey(tabId, requestId));
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: method === 'Network.webSocketFrameSent' ? 'sent' : 'message',
          url,
          timestamp: Date.now(),
          data: {
            url,
            direction: method === 'Network.webSocketFrameSent' ? 'outgoing' : 'incoming',
            ...formatWsMessage(response.payloadData, response.opcode, response.mask)
          }
        });
        break;
      }
      case 'Network.webSocketFrameError': {
        const requestId = String((params as { requestId: string }).requestId);
        const errorMessage = (params as { errorMessage?: string }).errorMessage;
        const url = websocketUrls.get(getSocketKey(tabId, requestId));
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: 'error',
          url,
          timestamp: Date.now(),
          data: {
            url,
            errorMessage
          }
        });
        break;
      }
      case 'Network.webSocketClosed': {
        const requestId = String((params as { requestId: string }).requestId);
        const key = getSocketKey(tabId, requestId);
        const url = websocketUrls.get(key);
        websocketUrls.delete(key);
        void sendWebSocketEvent(tabId, {
          requestId,
          phase: 'closed',
          url,
          timestamp: Date.now(),
          data: {
            url
          }
        });
        break;
      }
      default:
        break;
    }
  });

  chrome.debugger.onDetach.addListener((source) => {
    if (!source.tabId) {
      return;
    }

    attachedTabs.delete(source.tabId);
  });
});
