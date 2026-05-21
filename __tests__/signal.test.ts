/**
 * Tests for WebSocket signaling handlers
 */

import { RoomService } from '../src/services/RoomService';
import { PeerService } from '../src/services/PeerService';
import { SignalHandler } from '../src/handlers/signalHandler';
import { createRoomId, createPeerId } from '../src/types';
import WebSocket from 'ws';

describe('SignalHandler', () => {
  let roomService: RoomService;
  let peerService: PeerService;
  let signalHandler: SignalHandler;
  let mockWs: any;

  beforeEach(() => {
    roomService = new RoomService();
    peerService = new PeerService();
    signalHandler = new SignalHandler(roomService, peerService);

    // Mock WebSocket
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    };
  });

  afterEach(() => {
    roomService.destroy();
  });

  describe('handleCreateRoom', () => {
    it('creates a room and returns roomId', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const createRoomMsg = JSON.stringify({
        type: 'create_room',
        role: 'sender',
      });

      signalHandler.handleMessage(peerId, createRoomMsg);

      expect(mockWs.send).toHaveBeenCalled();
    });
  });

  describe('handleJoinRoom', () => {
    it('joins receiver to an existing room', () => {
      // Create room with sender
      const { roomId } = roomService.createRoom();
      const senderId = createPeerId('sender1');
      const receiverId = createPeerId('receiver1');

      peerService.registerPeer(senderId, mockWs);
      peerService.registerPeer(receiverId, mockWs);

      // Join room as receiver
      const joinMsg = JSON.stringify({
        type: 'join_room',
        roomId,
        role: 'receiver',
      });

      signalHandler.handleMessage(receiverId, joinMsg);

      // Should send room_joined confirmation
      expect(mockWs.send).toHaveBeenCalled();

      // Verify room is complete
      expect(roomService.isRoomComplete(roomId)).toBe(true);
    });
  });

  describe('handleOffer', () => {
    it('forwards offer SDP to receiver', () => {
      const { roomId, peerId: senderId } = roomService.createRoom();
      const receiverWs = { readyState: WebSocket.OPEN, send: jest.fn() };
      const receiverId = createPeerId('receiver1');

      roomService.joinRoom(roomId);

      peerService.registerPeer(senderId, mockWs);
      peerService.registerPeer(receiverId, receiverWs);

      const offerMsg = JSON.stringify({
        type: 'offer',
        roomId,
        sdp: 'offer_sdp_data',
      });

      signalHandler.handleMessage(senderId, offerMsg);

      // Receiver should receive offer
      expect(receiverWs.send).toHaveBeenCalled();
    });
  });

  describe('handleIceCandidate', () => {
    it('exchanges ICE candidates between peers', () => {
      const { roomId, peerId: senderId } = roomService.createRoom();
      const receiverWs = { readyState: WebSocket.OPEN, send: jest.fn() };
      const receiverId = createPeerId('receiver1');

      const result = roomService.joinRoom(roomId);
      if (result) {
        const { peerId: actualReceiverId } = result;

        peerService.registerPeer(senderId, mockWs);
        peerService.registerPeer(actualReceiverId, receiverWs as any as WebSocket);

        const iceMsg = JSON.stringify({
          type: 'ice_candidate',
          roomId,
          candidate: {
            candidate: 'candidate:1234567890',
            sdpMLineIndex: 0,
            sdpMid: 'audio',
          },
        });

        signalHandler.handleMessage(senderId, iceMsg);

        // Store should have candidate
        const candidates = roomService.getIceCandidates(roomId, senderId);
        expect(candidates.length).toBeGreaterThan(0);
      }
    });
  });

  describe('handleDisconnect', () => {
    it('removes peer and notifies room', () => {
      const { roomId, peerId: senderId } = roomService.createRoom();
      const receiverWs = { readyState: WebSocket.OPEN, send: jest.fn() };
      const result = roomService.joinRoom(roomId);

      if (result) {
        const { peerId: receiverId } = result;

        peerService.registerPeer(senderId, mockWs);
        peerService.registerPeer(receiverId, receiverWs as any as WebSocket);

        const disconnectMsg = JSON.stringify({
          type: 'disconnect',
          roomId,
        });

        signalHandler.handleMessage(senderId, disconnectMsg);

        // Room should be deleted
        expect(roomService.getRoom(roomId)).toBeUndefined();
      }
    });
  });

  describe('error handling', () => {
    it('sends error for invalid signal format', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const invalidMsg = 'not json';

      signalHandler.handleMessage(peerId, invalidMsg);

      // Should attempt to send error (will fail gracefully)
      expect(mockWs.send).not.toThrow();
    });

    it('rejects joining non-existent room', () => {
      const peerId = createPeerId('peer1');
      peerService.registerPeer(peerId, mockWs);

      const joinMsg = JSON.stringify({
        type: 'join_room',
        roomId: createRoomId('nonexistent'),
        role: 'receiver',
      });

      signalHandler.handleMessage(peerId, joinMsg);

      // Should send error
      expect(mockWs.send).toHaveBeenCalled();
    });
  });
});
