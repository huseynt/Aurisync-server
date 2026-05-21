/**
 * PeerService - Manages peer connections and WebSocket tracking
 */

import WebSocket from 'ws';
import { PeerId, RoomId } from '../types';

interface PeerConnection {
  peerId: PeerId;
  roomId?: RoomId;
  ws: WebSocket;
  connectedAt: number;
}

export class PeerService {
  private peers = new Map<PeerId, PeerConnection>();

  /**
   * Register a new peer connection
   */
  registerPeer(peerId: PeerId, ws: WebSocket): void {
    this.peers.set(peerId, {
      peerId,
      ws,
      connectedAt: Date.now(),
    });
  }

  /**
   * Associate a peer with a room
   */
  setPeerRoom(peerId: PeerId, roomId: RoomId): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return false;
    }

    peer.roomId = roomId;
    return true;
  }

  /**
   * Get a peer by ID
   */
  getPeer(peerId: PeerId): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get WebSocket for a peer
   */
  getPeerSocket(peerId: PeerId): WebSocket | undefined {
    return this.peers.get(peerId)?.ws;
  }

  /**
   * Get room for a peer
   */
  getPeerRoom(peerId: PeerId): RoomId | undefined {
    return this.peers.get(peerId)?.roomId;
  }

  /**
   * Remove a peer
   */
  removePeer(peerId: PeerId): boolean {
    return this.peers.delete(peerId);
  }

  /**
   * Send a message to a specific peer
   */
  sendToPeer(peerId: PeerId, message: any): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return false;
    }

    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
      return true;
    }

    return false;
  }

  /**
   * Broadcast a message to all peers in a room
   */
  broadcastToRoom(roomId: RoomId, message: any, excludePeerId?: PeerId): void {
    this.peers.forEach((peer) => {
      if (peer.roomId === roomId && peer.peerId !== excludePeerId) {
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify(message));
        }
      }
    });
  }

  /**
   * Get all peers in a room
   */
  getPeersInRoom(roomId: RoomId): PeerConnection[] {
    const result: PeerConnection[] = [];
    this.peers.forEach((peer) => {
      if (peer.roomId === roomId) {
        result.push(peer);
      }
    });
    return result;
  }

  /**
   * Get all active peers (for monitoring)
   */
  getAllPeers(): PeerConnection[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalPeers: this.peers.size,
      peersPerRoom: this.getPeersPerRoom(),
      averageConnectionTime: this.getAverageConnectionTime(),
    };
  }

  /**
   * Helper: count peers per room
   */
  private getPeersPerRoom(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.peers.forEach((peer) => {
      if (peer.roomId) {
        counts[peer.roomId] = (counts[peer.roomId] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Helper: average connection duration
   */
  private getAverageConnectionTime(): number {
    if (this.peers.size === 0) {
      return 0;
    }

    const now = Date.now();
    const total = Array.from(this.peers.values()).reduce(
      (sum, peer) => sum + (now - peer.connectedAt),
      0
    );

    return Math.round(total / this.peers.size);
  }
}
