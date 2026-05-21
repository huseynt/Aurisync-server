/**
 * Tests for RoomService
 */

import { RoomService } from '../src/services/RoomService';
import { createRoomId } from '../src/types';

describe('RoomService', () => {
  let roomService: RoomService;

  beforeEach(() => {
    roomService = new RoomService();
  });

  afterEach(() => {
    roomService.destroy();
  });

  describe('createRoom', () => {
    it('creates a new room with roomId and peerId', () => {
      const { roomId, peerId } = roomService.createRoom();

      expect(roomId).toBeTruthy();
      expect(peerId).toBeTruthy();
    });

    it('creates unique room IDs', () => {
      const { roomId: id1 } = roomService.createRoom();
      const { roomId: id2 } = roomService.createRoom();

      expect(id1).not.toBe(id2);
    });

    it('initializes room with sender', () => {
      const { roomId, peerId } = roomService.createRoom();
      const room = roomService.getRoom(roomId);

      expect(room).toBeTruthy();
      expect(room?.sender?.peerId).toBe(peerId);
      expect(room?.receiver).toBeUndefined();
    });
  });

  describe('joinRoom', () => {
    it('allows receiver to join existing room', () => {
      const { roomId } = roomService.createRoom();
      const result = roomService.joinRoom(roomId);

      expect(result).not.toBeNull();
      expect(result?.peerId).toBeTruthy();
      expect(result?.room.receiver).toBeTruthy();
    });

    it('returns null for non-existent room', () => {
      const result = roomService.joinRoom(createRoomId('nonexistent'));

      expect(result).toBeNull();
    });

    it('prevents multiple receivers in same room', () => {
      const { roomId } = roomService.createRoom();

      // First receiver joins
      const result1 = roomService.joinRoom(roomId);
      expect(result1).not.toBeNull();

      // Second receiver cannot join
      const result2 = roomService.joinRoom(roomId);
      expect(result2).toBeNull();
    });
  });

  describe('isRoomComplete', () => {
    it('returns false when only sender is present', () => {
      const { roomId } = roomService.createRoom();

      expect(roomService.isRoomComplete(roomId)).toBe(false);
    });

    it('returns true when both sender and receiver are present', () => {
      const { roomId } = roomService.createRoom();
      roomService.joinRoom(roomId);

      expect(roomService.isRoomComplete(roomId)).toBe(true);
    });
  });

  describe('ICE candidate management', () => {
    it('adds and retrieves ICE candidates', () => {
      const { roomId, peerId } = roomService.createRoom();
      const candidate = {
        candidate: 'candidate:123456',
        sdpMLineIndex: 0,
        sdpMid: 'audio',
      };

      roomService.addIceCandidate(roomId, peerId, candidate);
      const candidates = roomService.getIceCandidates(roomId, peerId);

      expect(candidates).toContain(candidate);
    });

    it('clears ICE candidates after retrieval', () => {
      const { roomId, peerId } = roomService.createRoom();
      const candidate = {
        candidate: 'candidate:123456',
        sdpMLineIndex: 0,
        sdpMid: 'audio',
      };

      roomService.addIceCandidate(roomId, peerId, candidate);
      roomService.clearIceCandidates(roomId, peerId);

      const candidates = roomService.getIceCandidates(roomId, peerId);
      expect(candidates.length).toBe(0);
    });
  });

  describe('room deletion', () => {
    it('deletes a room', () => {
      const { roomId } = roomService.createRoom();

      expect(roomService.getRoom(roomId)).toBeTruthy();

      roomService.deleteRoom(roomId);

      expect(roomService.getRoom(roomId)).toBeUndefined();
    });
  });

  describe('peer ID resolution', () => {
    it('returns other peer in room', () => {
      const { roomId, peerId: senderId } = roomService.createRoom();
      const result = roomService.joinRoom(roomId);

      if (result) {
        const { peerId: receiverId } = result;

        const otherPeerId = roomService.getOtherPeerId(roomId, senderId);
        expect(otherPeerId).toBe(receiverId);
      }
    });
  });
});
