import { Inspectra } from '@inspectra/sdk';

declare const __INSPECTRA_RELAY_URL__: string;
declare const __INSPECTRA_RELAY_ROOM__: string;

declare global {
  interface Window {
    __inspectraBookmarkletLaunch?: () => Promise<void>;
  }
}

const RELAY_URL = __INSPECTRA_RELAY_URL__;
const RELAY_ROOM = __INSPECTRA_RELAY_ROOM__;

const launchInspectraBookmarklet = async () => {
  await Inspectra.init({
    relay: RELAY_URL || undefined,
    room: RELAY_ROOM || undefined
  });
};

window.__inspectraBookmarkletLaunch = launchInspectraBookmarklet;
void launchInspectraBookmarklet();
