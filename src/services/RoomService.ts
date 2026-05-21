/**
 * RoomService - Manages room creation, joining, and state
 */

import {
  RoomId,
  PeerId,
  RoomState,
  createRoomId,
  createPeerId,
  RTCIceCandidate,
} from '../types';

const ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class RoomService {
  private rooms = new Map<RoomId, RoomState>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveRooms();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Create a new room
   */
  createRoom(): { roomId: RoomId; peerId: PeerId } {
    const roomId = createRoomId(this.generateId());
    const peerId = createPeerId(this.generateId());

    const room: RoomState = {
      roomId,
      sender: {
        peerId,
        createdAt: Date.now(),
      },
      iceCandidates: {
        [peerId]: [],
      },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    return { roomId, peerId };
  }

  /**
   * Join an existing room
   */
  joinRoom(roomId: RoomId): { peerId: PeerId; room: RoomState } | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    // Check if receiver already joined
    if (room.receiver) {
      return null; // Only 1-1 connections supported
    }

    const peerId = createPeerId(this.generateId());
    room.receiver = {
      peerId,
      createdAt: Date.now(),
    };

    room.iceCandidates[peerId] = [];
    room.lastActivityAt = Date.now();

    return { peerId, room };
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: RoomId): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Check if room is complete (both peers joined)
   */
  isRoomComplete(roomId: RoomId): boolean {
    const room = this.rooms.get(roomId);
    return !!(room && room.sender && room.receiver);
  }

  /**
   * Add ICE candidate
   */
  addIceCandidate(
    roomId: RoomId,
    peerId: PeerId,
    candidate: RTCIceCandidate
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    if (!room.iceCandidates[peerId]) {
      room.iceCandidates[peerId] = [];
    }

    room.iceCandidates[peerId].push(candidate);
    room.lastActivityAt = Date.now();
    return true;
  }

  /**
   * Get ICE candidates for a peer
   */
  getIceCandidates(roomId: RoomId, peerId: PeerId): RTCIceCandidate[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }

    return room.iceCandidates[peerId] || [];
  }

  /**
   * Remove ICE candidates (after they've been sent)
   */
  clearIceCandidates(roomId: RoomId, peerId: PeerId): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.iceCandidates[peerId] = [];
    }
  }

  /**
   * Get the peer ID of the other peer in a room
   */
  getOtherPeerId(roomId: RoomId, peerId: PeerId): PeerId | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    if (room.sender?.peerId === peerId) {
      return room.receiver?.peerId || null;
    }

    if (room.receiver?.peerId === peerId) {
      return room.sender?.peerId || null;
    }

    return null;
  }

  /**
   * Delete a room
   */
  deleteRoom(roomId: RoomId): boolean {
    return this.rooms.delete(roomId);
  }

  /**
   * Get all active rooms (for monitoring)
   */
  getAllRooms(): RoomState[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Clean up inactive rooms
   */
  private cleanupInactiveRooms(): void {
    const now = Date.now();
    const toDelete: RoomId[] = [];

    this.rooms.forEach((room, roomId) => {
      if (now - room.lastActivityAt > ROOM_TIMEOUT) {
        toDelete.push(roomId);
      }
    });

    toDelete.forEach((roomId) => {
      this.deleteRoom(roomId);
      console.log(`[RoomService] Cleaned up inactive room: ${roomId}`);
    });
  }

  /**
   * Destroy service (cleanup interval)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Generate a random ID (5-7 digits for room IDs, longer for peer IDs)
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
