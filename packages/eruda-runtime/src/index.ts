import eruda from 'eruda';
import { bootstrapInspectraAgent } from '@inspectra/agent-main';
import { createErudaWebRtcPlugin } from '@inspectra/eruda-plugin-webrtc';
import { isInspectraRuntimeMessage } from './protocol';

export const bootstrapInspectraErudaRuntime = () => {
  bootstrapInspectraAgent();

  let erudaInitialized = false;
  let latestSessionId = '';

  const ensureEruda = (sessionId: string) => {
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
      eruda.get('info')?.add('Inspectra Session', () => latestSessionId);
      eruda.get('info')?.add('Inspectra Runtime', 'Eruda baseline + Inspectra plugins');
      eruda.get('snippets')?.add(
        'Hide Inspectra',
        () => {
          eruda.hide();
          eruda.get('entryBtn')?.hide();
        },
        'Hide the Eruda panel and entry button'
      );
      erudaInitialized = true;
    }

    latestSessionId = sessionId;
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || !isInspectraRuntimeMessage(event.data)) {
      return;
    }

    switch (event.data.type) {
      case 'agent:bootstrap':
        ensureEruda(event.data.payload.sessionId);
        break;
      case 'overlay:set-visible':
        if (!erudaInitialized) {
          return;
        }

        if (event.data.payload.visible) {
          eruda.get('entryBtn')?.show();
          eruda.show();
        } else {
          eruda.hide();
          eruda.get('entryBtn')?.hide();
        }
        break;
      default:
        break;
    }
  });
};
