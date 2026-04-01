import eruda from 'eruda';
import { bootstrapInspectraAgent } from '@inspectra/agent-main';
import { createErudaMediaPermissionsPlugin } from '@inspectra/eruda-plugin-media-permissions';
import { createErudaWebRtcPlugin } from '@inspectra/eruda-plugin-webrtc';
import { createErudaWebSocketPlugin } from '@inspectra/eruda-plugin-websocket';
import { createErudaRemotePlugin } from '@inspectra/eruda-plugin-remote';
import { isInspectraRuntimeMessage } from './protocol';

export const bootstrapInspectraErudaRuntime = () => {
  // Keep runtime injection self-sufficient even if the separate agent content script
  // is not present in a given build or browser session.
  bootstrapInspectraAgent();

  let erudaInitialized = false;
  let latestSessionId = '';

  const ensureEruda = () => {
    if (!erudaInitialized) {
      eruda.init({
        autoScale: true,
        useShadowDom: false,
        tool: [
          'console',
          'elements',
          'network',
          'resources',
          'sources',
          'info',
          'snippets',
          'settings'
        ],
        defaults: {
          theme: 'Dark',
          displaySize: 70
        }
      });

      eruda.add(createErudaWebRtcPlugin());
      eruda.add(createErudaMediaPermissionsPlugin());
      eruda.add(createErudaWebSocketPlugin());
      eruda.add(createErudaRemotePlugin());
      eruda.get('info')?.add('Inspectra Session', () => latestSessionId);
      eruda.get('info')?.add('Inspectra Runtime', 'Eruda baseline + Inspectra plugins');
      eruda.hide();
      eruda.get('entryBtn')?.hide();
      erudaInitialized = true;
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || !isInspectraRuntimeMessage(event.data)) {
      return;
    }

    switch (event.data.type) {
      case 'agent:bootstrap':
        latestSessionId = event.data.payload.sessionId;
        break;
      case 'overlay:set-visible':
        if (event.data.payload.visible) {
          ensureEruda();
          eruda.get('entryBtn')?.show();
          eruda.show();
        } else {
          if (!erudaInitialized) {
            return;
          }
          eruda.hide();
          eruda.get('entryBtn')?.hide();
        }
        break;
      default:
        break;
    }
  });
};
