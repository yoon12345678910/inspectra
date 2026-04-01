import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 9229;
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;

interface RelayMessage {
  type: 'join' | 'event' | 'peer-count';
  room?: string;
  kind?: string;
  payload?: unknown;
  count?: number;
}

const rooms = new Map<string, Set<WebSocket>>();

const broadcast = (room: string, sender: WebSocket, data: string) => {
  const clients = rooms.get(room);
  if (!clients) return;
  for (const client of clients) {
    if (client !== sender && client.readyState === 1) {
      client.send(data);
    }
  }
};

const sendPeerCount = (room: string) => {
  const clients = rooms.get(room);
  if (!clients) return;
  const msg = JSON.stringify({ type: 'peer-count', count: clients.size });
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
};

const useTls = TLS_CERT && TLS_KEY && existsSync(TLS_CERT) && existsSync(TLS_KEY);

const handleRequest = (_req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
};

const server = useTls
  ? createHttpsServer({
      cert: readFileSync(TLS_CERT!),
      key: readFileSync(TLS_KEY!)
    }, handleRequest)
  : createHttpServer(handleRequest);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentRoom: string | null = null;

  ws.on('message', (raw) => {
    let msg: RelayMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === 'join' && typeof msg.room === 'string') {
      if (currentRoom) {
        rooms.get(currentRoom)?.delete(ws);
        sendPeerCount(currentRoom);
      }
      currentRoom = msg.room;
      if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
      rooms.get(currentRoom)!.add(ws);
      sendPeerCount(currentRoom);
      return;
    }

    if (msg.type === 'event' && currentRoom) {
      broadcast(currentRoom, ws, String(raw));
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      rooms.get(currentRoom)?.delete(ws);
      const clients = rooms.get(currentRoom);
      if (clients && clients.size === 0) {
        rooms.delete(currentRoom);
      } else if (currentRoom) {
        sendPeerCount(currentRoom);
      }
    }
  });
});

server.listen(PORT, () => {
  const protocol = useTls ? 'wss' : 'ws';
  console.log(`[Inspectra Relay] listening on ${protocol}://localhost:${PORT}`);
  if (useTls) {
    console.log(`[Inspectra Relay] TLS enabled (cert: ${TLS_CERT})`);
  } else {
    console.log(`[Inspectra Relay] TLS disabled — set TLS_CERT and TLS_KEY env vars for wss://`);
    console.log(`[Inspectra Relay]   mkcert localhost 192.168.1.100`);
    console.log(`[Inspectra Relay]   TLS_CERT=./localhost+1.pem TLS_KEY=./localhost+1-key.pem pnpm relay`);
  }
});
