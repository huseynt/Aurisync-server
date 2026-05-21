/**
 * Tests for PeerService
 */

import { PeerService } from '../src/services/PeerService';
import { createPeerId, createRoomId } from '../src/types';
import WebSocket from 'ws';

describe('PeerService', () => {
  let peerService: PeerService;
  let mockWs: any;

  beforeEach(() => {
    peerService = new PeerService();
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    };
  });

  describe('registerPeer', () => {
    it('registers a new peer', () => {
      const peerId = createPeerId('peer1');

      peerService.registerPeer(peerId, mockWs);

      expect(peerService.getPeer(peerId)).toBeTruthy();
    });
  });

  describe('getPeer', () => {
    it('retrieves registered peer', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const peer = peerService.getPeer(peerId);

      expect(peer?.peerId).toBe(peerId);
      expect(peer?.ws).toBe(mockWs);
    });

    it('returns undefined for unregistered peer', () => {
      const peer = peerService.getPeer(createPeerId('unknown'));

      expect(peer).toBeUndefined();
    });
  });

  describe('room association', () => {
    it('associates peer with room', () => {
      const peerId = createPeerId('peer1');
      const roomId = createRoomId('room1');

      peerService.registerPeer(peerId, mockWs);
      peerService.setPeerRoom(peerId, roomId);

      expect(peerService.getPeerRoom(peerId)).toBe(roomId);
    });
  });

  describe('messaging', () => {
    it('sends message to specific peer', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const message = { type: 'test', data: 'hello' };
      const result = peerService.sendToPeer(peerId, message);

      expect(result).toBe(true);
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('returns false when sending to closed connection', () => {
      const peerId = createPeerId('peer1');
      const closedWs = {
        readyState: WebSocket.CLOSED,
        send: jest.fn(),
      } as any as WebSocket;

      peerService.registerPeer(peerId, closedWs);

      const message = { type: 'test', data: 'hello' };
      const result = peerService.sendToPeer(peerId, message);

      expect(result).toBe(false);
    });
  });

  describe('room broadcasting', () => {
    it('broadcasts message to all peers in room', () => {
      const roomId = createRoomId('room1');
      const peerId1 = createPeerId('peer1');
      const peerId2 = createPeerId('peer2');
      const ws1 = { readyState: WebSocket.OPEN, send: jest.fn() };
      const ws2 = { readyState: WebSocket.OPEN, send: jest.fn() };

      peerService.registerPeer(peerId1, ws1);
      peerService.registerPeer(peerId2, ws2);
      peerService.setPeerRoom(peerId1, roomId);
      peerService.setPeerRoom(peerId2, roomId);

      const message = { type: 'broadcast', data: 'hello all' };
      peerService.broadcastToRoom(roomId, message);

      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('excludes specified peer from broadcast', () => {
      const roomId = createRoomId('room1');
      const peerId1 = createPeerId('peer1');
      const peerId2 = createPeerId('peer2');
      const ws1 = { readyState: WebSocket.OPEN, send: jest.fn() } as any as WebSocket;
      const ws2 = { readyState: WebSocket.OPEN, send: jest.fn() } as any as WebSocket;

      peerService.registerPeer(peerId1, ws1);
      peerService.registerPeer(peerId2, ws2);
      peerService.setPeerRoom(peerId1, roomId);
      peerService.setPeerRoom(peerId2, roomId);

      const message = { type: 'broadcast', data: 'hello' };
      peerService.broadcastToRoom(roomId, message, peerId1);

      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('peer removal', () => {
    it('removes peer', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      peerService.removePeer(peerId);

      expect(peerService.getPeer(peerId)).toBeUndefined();
    });
  });

  describe('statistics', () => {
    it('provides connection statistics', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const stats = peerService.getStats();

      expect(stats.totalPeers).toBe(1);
      expect(stats.averageConnectionTime).toBeGreaterThanOrEqual(0);
    });
  });
});
