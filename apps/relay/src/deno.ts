/**
 * @deprecated Kept for reference. Production relay now runs on Render (Node.js).
 * See node.ts for the active implementation.
 */

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
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

const sendPeerCount = (room: string) => {
  const clients = rooms.get(room);
  if (!clients) return;
  const msg = JSON.stringify({ type: 'peer-count', count: clients.size });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
};

Deno.serve((req) => {
  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Inspectra Relay — WebSocket endpoint', { status: 200 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let currentRoom: string | null = null;

  socket.onmessage = (event) => {
    let msg: RelayMessage;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (msg.type === 'join' && typeof msg.room === 'string') {
      if (currentRoom) {
        rooms.get(currentRoom)?.delete(socket);
        sendPeerCount(currentRoom);
      }
      currentRoom = msg.room;
      if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
      rooms.get(currentRoom)!.add(socket);
      sendPeerCount(currentRoom);
      return;
    }

    if (msg.type === 'event' && currentRoom) {
      broadcast(currentRoom, socket, String(event.data));
    }
  };

  socket.onclose = () => {
    if (currentRoom) {
      rooms.get(currentRoom)?.delete(socket);
      const clients = rooms.get(currentRoom);
      if (clients && clients.size === 0) {
        rooms.delete(currentRoom);
      } else if (currentRoom) {
        sendPeerCount(currentRoom);
      }
    }
  };

  return response;
});

console.log('[Inspectra Relay] Deno server started');
