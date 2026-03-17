import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_MESSAGE = 'inspectra:toggle-overlay';

export default defineBackground(() => {
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
