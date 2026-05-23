/**
 * Signal Handler - Routes WebSocket messages between peers
 *
 * FIX: handleCreateRoom and handleJoinRoom previously re-registered the
 * original WebSocket under a newly generated peerId while leaving the
 * original peerId dangling in PeerService.  All subsequent sends went to
 * the new (unused) peerId and were silently dropped.
 * The handler now uses the connection's own peerId throughout.
 */

import WebSocket from 'ws';
import { RoomService } from '../services/RoomService';
import { PeerService } from '../services/PeerService';
import {
  ClientSignal,
  ServerSignal,
  isClientSignal,
  createPeerId,
  RoomId,
} from '../types';

export class SignalHandler {
  private roomService: RoomService;
  private peerService: PeerService;

  constructor(roomService: RoomService, peerService: PeerService) {
    this.roomService = roomService;
    this.peerService = peerService;
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(peerId: any, message: string): void {
    try {
      const signal = JSON.parse(message);

      // keep-alive ping — handle before type-guard
      if (signal.type === 'ping') return;

      if (!isClientSignal(signal)) {
        this.sendErrorToPeer(peerId, 'Invalid signal format');
        return;
      }

      switch (signal.type) {
        case 'create_room':
          this.handleCreateRoom(peerId);
          break;
        case 'join_room':
          this.handleJoinRoom(peerId, signal.roomId);
          break;
        case 'offer':
          this.handleOffer(peerId, signal.roomId, signal.sdp);
          break;
        case 'answer':
          this.handleAnswer(peerId, signal.roomId, signal.sdp);
          break;
        case 'ice_candidate':
          this.handleIceCandidate(peerId, signal.roomId, signal.candidate);
          break;
        case 'disconnect':
          this.handleDisconnect(peerId, signal.roomId);
          break;
        default:
          this.sendErrorToPeer(peerId, 'Unknown signal type');
      }
    } catch (error) {
      console.error(`[SignalHandler] Error parsing message from ${peerId}:`, error);
      this.sendErrorToPeer(peerId, 'Failed to parse message');
    }
  }

  /**
   * Handle create_room signal from sender
   * Uses the connection's own peerId — no extra peerId is generated.
   */
  private handleCreateRoom(peerId: any): void {
    const roomId = this.roomService.createRoomForPeer(peerId);

    const response: ServerSignal = {
      type: 'room_created',
      roomId,
    };

    this.peerService.setPeerRoom(createPeerId(peerId), roomId);
    this.peerService.sendToPeer(createPeerId(peerId), response);
    console.log(`[SignalHandler] Room created: ${roomId} by ${peerId}`);
  }

  /**
   * Handle join_room signal from receiver
   */
  private handleJoinRoom(peerId: any, roomId: any): void {
    const ok = this.roomService.joinRoomAsPeer(roomId, peerId);

    if (!ok) {
      this.sendErrorToPeer(peerId, 'Room not found or already has receiver');
      return;
    }

    this.peerService.setPeerRoom(createPeerId(peerId), roomId);

    // Confirm to receiver
    const joinedResponse: ServerSignal = {
      type: 'room_joined',
      roomId,
    };
    this.peerService.sendToPeer(createPeerId(peerId), joinedResponse);

    // Notify sender
    const room = this.roomService.getRoom(roomId);
    if (room?.senderPeerId) {
      const peerJoinedResponse: ServerSignal = {
        type: 'peer_joined',
        peerId: createPeerId(peerId),
      };
      this.peerService.sendToPeer(createPeerId(room.senderPeerId), peerJoinedResponse);
    }

    console.log(`[SignalHandler] Receiver ${peerId} joined room ${roomId}`);
  }

  /**
   * Handle offer signal (SDP from sender)
   */
  private handleOffer(peerId: any, roomId: any, sdp: string): void {
    const room = this.roomService.getRoom(roomId);
    if (!room?.receiverPeerId) {
      this.sendErrorToPeer(peerId, 'Room not found or receiver not ready');
      return;
    }

    const response: ServerSignal = {
      type: 'offer',
      roomId,
      sdp,
      peerId: createPeerId(peerId),
    };

    this.peerService.sendToPeer(createPeerId(room.receiverPeerId), response);
    console.log(`[SignalHandler] Offer forwarded from ${peerId} to ${room.receiverPeerId}`);
  }

  /**
   * Handle answer signal (SDP from receiver)
   */
  private handleAnswer(peerId: any, roomId: any, sdp: string): void {
    const room = this.roomService.getRoom(roomId);
    if (!room?.senderPeerId) {
      this.sendErrorToPeer(peerId, 'Room not found or sender not ready');
      return;
    }

    const response: ServerSignal = {
      type: 'answer',
      roomId,
      sdp,
      peerId: createPeerId(peerId),
    };

    this.peerService.sendToPeer(createPeerId(room.senderPeerId), response);
    console.log(`[SignalHandler] Answer forwarded from ${peerId} to ${room.senderPeerId}`);
  }

  /**
   * Handle ICE candidate signal
   */
  private handleIceCandidate(peerId: any, roomId: any, candidate: any): void {
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      this.sendErrorToPeer(peerId, 'Room not found');
      return;
    }

    let targetPeerId: string | undefined;
    if (room.senderPeerId === peerId) {
      targetPeerId = room.receiverPeerId;
    } else if (room.receiverPeerId === peerId) {
      targetPeerId = room.senderPeerId;
    }

    if (targetPeerId) {
      const response: ServerSignal = {
        type: 'ice_candidate',
        roomId,
        candidate,
        peerId: createPeerId(peerId),
      };
      this.peerService.sendToPeer(createPeerId(targetPeerId), response);
    }
  }

  /**
   * Handle explicit disconnect signal
   */
  private handleDisconnect(peerId: any, roomId?: any): void {
    if (roomId) {
      const room = this.roomService.getRoom(roomId);
      if (room) {
        let otherPeerId: string | undefined;
        if (room.senderPeerId === peerId)   otherPeerId = room.receiverPeerId;
        else if (room.receiverPeerId === peerId) otherPeerId = room.senderPeerId;

        if (otherPeerId) {
          const notification: ServerSignal = {
            type: 'peer_disconnected',
            roomId,
            peerId: createPeerId(peerId),
          };
          this.peerService.sendToPeer(createPeerId(otherPeerId), notification);
        }

        this.roomService.deleteRoom(roomId);
        console.log(`[SignalHandler] Room deleted: ${roomId}`);
      }
    }

    this.peerService.removePeer(createPeerId(peerId));
    console.log(`[SignalHandler] Peer disconnected: ${peerId}`);
  }

  /**
   * Handle peer disconnect (WebSocket close)
   */
  handlePeerDisconnect(peerId: any): void {
    const roomId = this.peerService.getPeerRoom(createPeerId(peerId));
    this.handleDisconnect(peerId, roomId);
  }

  private sendErrorToPeer(peerId: any, message: string): void {
    const response: ServerSignal = { type: 'error', message };
    this.peerService.sendToPeer(createPeerId(peerId), response);
  }
}