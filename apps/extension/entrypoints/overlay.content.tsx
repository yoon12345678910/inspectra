import { postToInspectraRuntime } from '@inspectra/eruda-runtime/protocol';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectScript } from 'wxt/utils/inject-script';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';
const REGISTER_DEBUGGER_MESSAGE = 'inspectra:register-debugger-target';
const WEBSOCKET_DEBUGGER_EVENT = 'inspectra:websocket-debugger-event';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `inspectra-${Date.now()}`;
    let runtimeInjected = false;
    let visible = false;

    const syncSession = () => {
      postToInspectraRuntime({
        type: 'agent:bootstrap',
        payload: {
          sessionId
        }
      });
    };

    const ensureRuntime = async () => {
      if (!runtimeInjected) {
        await injectScript('/main-world.js', { keepInDom: true });
        runtimeInjected = true;
      }
    };

    const syncVisibility = async (nextVisible: boolean) => {
      if (nextVisible) {
        await ensureRuntime();
        syncSession();
      }
      postToInspectraRuntime({
        type: 'overlay:set-visible',
        payload: {
          visible: nextVisible
        }
      });
    };

    await ensureRuntime();
    syncSession();
    void browser.runtime.sendMessage({
      type: REGISTER_DEBUGGER_MESSAGE
    });

    browser.runtime.onMessage.addListener(
      (message: { type?: string; payload?: Record<string, unknown> }) => {
        if (message?.type === WEBSOCKET_DEBUGGER_EVENT && message.payload) {
          postToInspectraRuntime({
            type: 'websocket:debugger-event',
            payload: message.payload as {
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
            }
          });
          return;
        }

        if (message?.type !== TOGGLE_MESSAGE) {
          return;
        }

        visible = !visible;
        void syncVisibility(visible);
      }
    );
  }
});
