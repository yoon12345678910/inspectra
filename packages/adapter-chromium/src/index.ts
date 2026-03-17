export interface ChromiumDeepAdapter {
  enabled: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export const createChromiumDeepAdapter = (): ChromiumDeepAdapter => ({
  enabled: false,
  async connect() {
    return;
  },
  async disconnect() {
    return;
  }
});

