import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';

const seedDefaults = async () => {
  const current = await browser.storage.local.get('overlaySettings');
  if (current.overlaySettings) {
    return;
  }

  await browser.storage.local.set({
    overlaySettings: {
      redactionEnabled: true,
      captureNetworkBodies: true,
      captureWebSocketPayloads: true,
      collapsedByDefault: false,
      maxEventBuffer: 3000,
      maxBodyPreviewBytes: 16384,
      maxWsPreviewBytes: 4096
    }
  });
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void seedDefaults();
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
      return;
    }

    try {
      await browser.tabs.sendMessage(tab.id, {
        type: TOGGLE_MESSAGE
      });
    } catch (error) {
      console.warn('Inspectra could not reach the content script for this tab.', error);
    }
  });
});
