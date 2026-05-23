/**
 * Aurisync WebSocket Signaling Server
 */

import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { RoomService } from './services/RoomService';
import { PeerService } from './services/PeerService';
import { SignalHandler } from './handlers/signalHandler';
import { createPeerId } from './types';

const PORT = process.env.PORT || 8080;
const app  = express();

app.use(cors());
app.use(express.json());

const roomService    = new RoomService();
const peerService    = new PeerService();
const signalHandler  = new SignalHandler(roomService, peerService);

const wss = new WebSocketServer({ noServer: true });

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    peers: peerService.getStats(),
  });
});

app.get('/stats', (_req, res) => {
  const stats = peerService.getStats();
  const rooms = roomService.getAllRooms();
  res.json({
    timestamp:   new Date().toISOString(),
    totalPeers:  stats.totalPeers,
    totalRooms:  rooms.length,
    rooms: rooms.map((r) => ({
      roomId:      r.roomId,
      hasSender:   !!r.senderPeerId,
      hasReceiver: !!r.receiverPeerId,
      uptime:      Date.now() - r.createdAt,
    })),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Aurisync Server listening on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws: WebSocket) => {
  const peerId = createPeerId(Math.random().toString(36).substring(2, 15));
  console.log(`✅ Peer connected: ${peerId}`);

  peerService.registerPeer(peerId, ws);

  ws.on('message', (data: Buffer) => {
    try {
      signalHandler.handleMessage(peerId, data.toString('utf8'));
    } catch (error) {
      console.error(`[Server] Error handling message from ${peerId}:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Peer disconnected: ${peerId}`);
    signalHandler.handlePeerDisconnect(peerId);
  });

  ws.on('error', (error) => {
    console.error(`[Server] WebSocket error for ${peerId}:`, error);
  });

  ws.send(JSON.stringify({
    type:      'welcome',
    peerId,
    timestamp: new Date().toISOString(),
  }));
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.clients.forEach((c) => c.close());
  roomService.destroy();
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
});

process.on('uncaughtException',   (e) => { console.error('❌ Uncaught Exception:',  e); process.exit(1); });
process.on('unhandledRejection',  (r) => { console.error('❌ Unhandled Rejection:', r); process.exit(1); });

export { app, wss, roomService, peerService, signalHandler };
