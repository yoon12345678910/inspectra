import '../src/overlay.css';
import ReactDOM from 'react-dom/client';
import { isInspectraAgentMessage, postToAgent } from '@inspectra/bridge';
import {
  OVERLAY_ROOT_ATTR,
  buildSessionExport,
  defaultCapabilities,
  defaultSettings,
  type OverlaySettings
} from '@inspectra/core';
import { OverlayApp, useOverlayStore } from '@inspectra/ui-overlay';
import { browser } from 'wxt/browser';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectScript } from 'wxt/utils/inject-script';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';

const downloadJson = (name: string, content: unknown) => {
  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const loadSettings = async () => {
  const stored = await browser.storage.local.get('overlaySettings');
  return {
    ...defaultSettings(),
    ...(stored.overlaySettings as Partial<OverlaySettings> | undefined)
  };
};

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx) {
    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `inspectra-${Date.now()}`;
    let agentInjected = false;
    let settings = await loadSettings();

    useOverlayStore.getState().setSettings(settings);
    useOverlayStore.getState().setCapabilities(defaultCapabilities());

    const ensureAgent = async () => {
      if (!agentInjected) {
        await injectScript('/main-world.js', { keepInDom: true });
        agentInjected = true;
      }

      postToAgent({
        type: 'agent:bootstrap',
        payload: {
          sessionId,
          settings
        }
      });
    };

    const ui = await createShadowRootUi(ctx, {
      name: 'inspectra-overlay',
      position: 'inline',
      anchor: 'body',
      onMount: (container, shadowRoot) => {
        shadowRoot.host.setAttribute(OVERLAY_ROOT_ATTR, 'true');
        const mount = document.createElement('div');
        container.append(mount);

        const root = ReactDOM.createRoot(mount);
        root.render(
          <OverlayApp
            sessionId={sessionId}
            onInspectToggle={(next) => {
              void ensureAgent().then(() => {
                postToAgent({
                  type: 'inspect:set-active',
                  payload: { active: next }
                });
              });
            }}
            onExport={() => {
              downloadJson(
                `inspectra-session-${Date.now()}.json`,
                buildSessionExport({
                  sessionId,
                  pageUrl: location.href,
                  events: useOverlayStore.getState().events,
                  capabilities: useOverlayStore.getState().capabilities,
                  settings: useOverlayStore.getState().settings
                })
              );
            }}
            onClose={() => {
              useOverlayStore.getState().setVisible(false);
              useOverlayStore.getState().setInspectActive(false);
              postToAgent({
                type: 'inspect:set-active',
                payload: { active: false }
              });
            }}
          />
        );
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      }
    });

    ui.mount();

    window.addEventListener('message', (event) => {
      if (event.source !== window || !isInspectraAgentMessage(event.data)) {
        return;
      }

      if (event.data.type === 'agent:events') {
        useOverlayStore.getState().pushEvents(event.data.payload.events);
      }
    });

    browser.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type !== TOGGLE_MESSAGE) {
        return;
      }

      const current = useOverlayStore.getState().visible;
      const next = !current;
      useOverlayStore.getState().setVisible(next);
      if (next) {
        void ensureAgent();
      } else {
        useOverlayStore.getState().setInspectActive(false);
        postToAgent({
          type: 'inspect:set-active',
          payload: { active: false }
        });
      }
    });

    window.addEventListener('focus', () => {
      postToAgent({
        type: 'storage:snapshot:request',
        payload: undefined
      });
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.overlaySettings?.newValue) {
        return;
      }
      settings = {
        ...defaultSettings(),
        ...(changes.overlaySettings.newValue as Partial<OverlaySettings>)
      };
      useOverlayStore.getState().setSettings(settings);
      postToAgent({
        type: 'settings:update',
        payload: settings
      });
    });
  }
});
