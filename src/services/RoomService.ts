/**
 * RoomService - Manages room creation, joining, and state
 *
 * CHANGED: rooms now keyed by the actual peer's connection ID (string),
 * no extra internal peerId is generated.  This eliminates the ID mismatch
 * that caused messages to be sent to non-existent peer entries.
 */

import { RoomId, createRoomId } from '../types';

const ROOM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export interface RoomState {
  roomId: RoomId;
  senderPeerId:   string;
  receiverPeerId?: string;
  createdAt:      number;
  lastActivityAt: number;
}

export class RoomService {
  private rooms = new Map<RoomId, RoomState>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupInactiveRooms(), 30_000);
  }

  /** Create a room; the connection's own peerId becomes the sender ID */
  createRoomForPeer(senderPeerId: string): RoomId {
    const roomId = createRoomId(this.generateId());
    this.rooms.set(roomId, {
      roomId,
      senderPeerId,
      createdAt:      Date.now(),
      lastActivityAt: Date.now(),
    });
    return roomId;
  }

  /** Join a room as receiver; returns false if room not found or full */
  joinRoomAsPeer(roomId: RoomId, receiverPeerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.receiverPeerId) return false;
    room.receiverPeerId  = receiverPeerId;
    room.lastActivityAt  = Date.now();
    return true;
  }

  getRoom(roomId: RoomId): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: RoomId): boolean {
    return this.rooms.delete(roomId);
  }

  getAllRooms(): RoomState[] {
    return Array.from(this.rooms.values());
  }

  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivityAt > ROOM_TIMEOUT) {
        this.rooms.delete(roomId);
        console.log(`[RoomService] Cleaned up inactive room: ${roomId}`);
      }
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
