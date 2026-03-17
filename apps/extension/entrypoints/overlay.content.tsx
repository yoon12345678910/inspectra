import { postToInspectraRuntime } from '@inspectra/eruda-runtime/protocol';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectScript } from 'wxt/utils/inject-script';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main() {
    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `inspectra-${Date.now()}`;
    let agentInjected = false;
    let visible = false;

    const ensureAgent = async (nextVisible: boolean) => {
      if (!agentInjected) {
        await injectScript('/main-world.js', { keepInDom: true });
        agentInjected = true;
      }

      postToInspectraRuntime({
        type: 'agent:bootstrap',
        payload: {
          sessionId
        }
      });
      postToInspectraRuntime({
        type: 'overlay:set-visible',
        payload: {
          visible: nextVisible
        }
      });
    };

    browser.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type !== TOGGLE_MESSAGE) {
        return;
      }

      visible = !visible;
      void ensureAgent(visible);
    });
  }
});
