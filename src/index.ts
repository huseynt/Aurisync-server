/**
 * Aurisync WebSocket Signaling Server
 * Handles room creation, peer joining, and SDP/ICE candidate exchange
 */

import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { RoomService } from './services/RoomService';
import { PeerService } from './services/PeerService';
import { SignalHandler } from './handlers/signalHandler';
import { createPeerId } from './types';

const PORT = process.env.PORT || 8080;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Services
const roomService = new RoomService();
const peerService = new PeerService();
const signalHandler = new SignalHandler(roomService, peerService);

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    peers: peerService.getStats(),
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  const stats = peerService.getStats();
  const rooms = roomService.getAllRooms();

  res.json({
    timestamp: new Date().toISOString(),
    totalPeers: stats.totalPeers,
    totalRooms: rooms.length,
    peersPerRoom: stats.peersPerRoom,
    averageConnectionTime: stats.averageConnectionTime,
    rooms: rooms.map((room) => ({
      roomId: room.roomId,
      hasSender: !!room.sender,
      hasReceiver: !!room.receiver,
      uptime: Date.now() - room.createdAt,
    })),
  });
});

// Upgrade HTTP to WebSocket
const server = app.listen(PORT, () => {
  console.log(`🚀 Aurisync Server listening on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket, request) => {
  const peerId = createPeerId(Math.random().toString(36).substring(2, 15));

  console.log(`✅ Peer connected: ${peerId}`);

  // Register peer
  peerService.registerPeer(peerId, ws);

  // Handle incoming messages
  ws.on('message', (data: Buffer) => {
    try {
      const message = data.toString('utf8');
      signalHandler.handleMessage(peerId, message);
    } catch (error) {
      console.error(`[Server] Error handling message from ${peerId}:`, error);
    }
  });

  // Handle peer disconnect
  ws.on('close', () => {
    console.log(`❌ Peer disconnected: ${peerId}`);
    signalHandler.handlePeerDisconnect(peerId);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`[Server] WebSocket error for ${peerId}:`, error);
  });

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: 'welcome',
      peerId,
      timestamp: new Date().toISOString(),
    })
  );
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });

  // Cleanup services
  roomService.destroy();

  // Close HTTP server
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Unhandled error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export { app, wss, roomService, peerService, signalHandler };
