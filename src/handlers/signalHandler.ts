/**
 * Signal Handler - Routes WebSocket messages between peers
 */

import WebSocket from 'ws';
import { RoomService } from '../services/RoomService';
import { PeerService } from '../services/PeerService';
import {
  ClientSignal,
  ServerSignal,
  isClientSignal,
  createPeerId,
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
      console.error('[SignalHandler] Error parsing message:', error);
      this.sendErrorToPeer(peerId, 'Failed to parse message');
    }
  }

  /**
   * Handle create_room signal from sender
   */
  private handleCreateRoom(peerId: any): void {
    const { roomId, peerId: senderId } = this.roomService.createRoom();

    this.peerService.registerPeer(senderId, this.peerService.getPeerSocket(peerId) || new WebSocket(''));
    this.peerService.setPeerRoom(senderId, roomId);

    const response: ServerSignal = {
      type: 'room_created',
      roomId,
    };

    this.peerService.sendToPeer(senderId, response);
    console.log(`[SignalHandler] Room created: ${roomId}`);
  }

  /**
   * Handle join_room signal from receiver
   */
  private handleJoinRoom(peerId: any, roomId: any): void {
    const result = this.roomService.joinRoom(roomId);

    if (!result) {
      this.sendErrorToPeer(peerId, 'Room not found or already has receiver');
      return;
    }

    const { peerId: receiverId, room } = result;

    this.peerService.registerPeer(receiverId, this.peerService.getPeerSocket(peerId) || new WebSocket(''));
    this.peerService.setPeerRoom(receiverId, roomId);

    // Send confirmation to receiver
    const joinedResponse: ServerSignal = {
      type: 'room_joined',
      roomId,
    };
    this.peerService.sendToPeer(receiverId, joinedResponse);

    // Notify sender that peer has joined
    if (room.sender) {
      const peerJoinedResponse: ServerSignal = {
        type: 'peer_joined',
        peerId: receiverId,
      };
      this.peerService.sendToPeer(room.sender.peerId, peerJoinedResponse);
    }

    console.log(`[SignalHandler] Receiver joined room: ${roomId}`);
  }

  /**
   * Handle offer signal (SDP from sender)
   */
  private handleOffer(peerId: any, roomId: any, sdp: string): void {
    const room = this.roomService.getRoom(roomId);
    if (!room || !room.receiver) {
      this.sendErrorToPeer(peerId, 'Room not found or receiver not ready');
      return;
    }

    const response: ServerSignal = {
      type: 'offer',
      roomId,
      sdp,
      peerId: room.sender?.peerId || createPeerId('unknown'),
    };

    this.peerService.sendToPeer(room.receiver.peerId, response);
    console.log(`[SignalHandler] Offer sent from ${room.sender?.peerId} to ${room.receiver.peerId}`);
  }

  /**
   * Handle answer signal (SDP from receiver)
   */
  private handleAnswer(peerId: any, roomId: any, sdp: string): void {
    const room = this.roomService.getRoom(roomId);
    if (!room || !room.sender) {
      this.sendErrorToPeer(peerId, 'Room not found or sender not ready');
      return;
    }

    const response: ServerSignal = {
      type: 'answer',
      roomId,
      sdp,
      peerId: room.receiver?.peerId || createPeerId('unknown'),
    };

    this.peerService.sendToPeer(room.sender.peerId, response);
    console.log(`[SignalHandler] Answer sent from ${room.receiver?.peerId} to ${room.sender.peerId}`);
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

    // Store candidate
    const peerIdObj = createPeerId(peerId);
    this.roomService.addIceCandidate(roomId, peerIdObj, candidate);

    // Determine which peer sent this and send to the other
    let targetPeerId = null;

    if (room.sender?.peerId === peerId) {
      targetPeerId = room.receiver?.peerId;
    } else if (room.receiver?.peerId === peerId) {
      targetPeerId = room.sender?.peerId;
    }

    if (targetPeerId) {
      const response: ServerSignal = {
        type: 'ice_candidate',
        roomId,
        candidate,
        peerId: createPeerId(peerId),
      };

      this.peerService.sendToPeer(targetPeerId, response);
    }
  }

  /**
   * Handle disconnect signal
   */
  private handleDisconnect(peerId: any, roomId?: any): void {
    if (roomId) {
      const room = this.roomService.getRoom(roomId);
      if (room) {
        // Notify other peer
        let otherPeerId = null;

        if (room.sender?.peerId === peerId) {
          otherPeerId = room.receiver?.peerId;
        } else if (room.receiver?.peerId === peerId) {
          otherPeerId = room.sender?.peerId;
        }

        if (otherPeerId) {
          const notification: ServerSignal = {
            type: 'peer_disconnected',
            roomId,
            peerId: createPeerId(peerId),
          };

          this.peerService.sendToPeer(otherPeerId, notification);
        }

        // Clean up room if both peers are gone
        this.roomService.deleteRoom(roomId);
        console.log(`[SignalHandler] Room deleted: ${roomId}`);
      }
    }

    this.peerService.removePeer(createPeerId(peerId));
    console.log(`[SignalHandler] Peer disconnected: ${peerId}`);
  }

  /**
   * Handle peer disconnect (connection closed)
   */
  handlePeerDisconnect(peerId: any): void {
    const roomId = this.peerService.getPeerRoom(createPeerId(peerId));
    this.handleDisconnect(peerId, roomId);
  }

  /**
   * Send error to peer
   */
  private sendErrorToPeer(peerId: any, message: string): void {
    const response: ServerSignal = {
      type: 'error',
      message,
    };

    this.peerService.sendToPeer(createPeerId(peerId), response);
  }
}
