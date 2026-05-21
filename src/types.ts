/**
 * Type definitions for WebSocket signaling protocol
 * All messages exchanged between client and server
 */

// Room ID format
export type RoomId = string & { readonly __roomId: unique symbol };

// Peer ID format
export type PeerId = string & { readonly __peerId: unique symbol };

// WebRTC SDP and ICE types
export interface RTCSessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface RTCIceCandidate {
  candidate: string;
  sdpMLineIndex: number;
  sdpMid: string;
}

// ============================================================
// CLIENT → SERVER SIGNALS
// ============================================================

export interface CreateRoomSignal {
  type: 'create_room';
  role: 'sender';
}

export interface JoinRoomSignal {
  type: 'join_room';
  roomId: RoomId;
  role: 'receiver';
}

export interface SendOfferSignal {
  type: 'offer';
  roomId: RoomId;
  sdp: string;
}

export interface SendAnswerSignal {
  type: 'answer';
  roomId: RoomId;
  sdp: string;
}

export interface SendIceCandidateSignal {
  type: 'ice_candidate';
  roomId: RoomId;
  candidate: RTCIceCandidate;
}

export interface DisconnectSignal {
  type: 'disconnect';
  roomId?: RoomId;
}

// Union of all client → server signals
export type ClientSignal =
  | CreateRoomSignal
  | JoinRoomSignal
  | SendOfferSignal
  | SendAnswerSignal
  | SendIceCandidateSignal
  | DisconnectSignal;

// ============================================================
// SERVER → CLIENT SIGNALS
// ============================================================

export interface RoomCreatedSignal {
  type: 'room_created';
  roomId: RoomId;
}

export interface RoomJoinedSignal {
  type: 'room_joined';
  roomId: RoomId;
}

export interface PeerJoinedSignal {
  type: 'peer_joined';
  peerId: PeerId;
}

export interface OfferSignal {
  type: 'offer';
  roomId: RoomId;
  sdp: string;
  peerId: PeerId;
}

export interface AnswerSignal {
  type: 'answer';
  roomId: RoomId;
  sdp: string;
  peerId: PeerId;
}

export interface IceCandidateSignal {
  type: 'ice_candidate';
  roomId: RoomId;
  candidate: RTCIceCandidate;
  peerId: PeerId;
}

export interface ErrorSignal {
  type: 'error';
  message: string;
  roomId?: RoomId;
}

export interface PeerDisconnectedSignal {
  type: 'peer_disconnected';
  roomId: RoomId;
  peerId: PeerId;
}

// Union of all server → client signals
export type ServerSignal =
  | RoomCreatedSignal
  | RoomJoinedSignal
  | PeerJoinedSignal
  | OfferSignal
  | AnswerSignal
  | IceCandidateSignal
  | ErrorSignal
  | PeerDisconnectedSignal;

// ============================================================
// ROOM STATE
// ============================================================

export interface RoomState {
  roomId: RoomId;
  sender?: {
    peerId: PeerId;
    createdAt: number;
  };
  receiver?: {
    peerId: PeerId;
    createdAt: number;
  };
  iceCandidates: {
    [peerId: string]: RTCIceCandidate[];
  };
  createdAt: number;
  lastActivityAt: number;
}

// Type guard functions
export const isClientSignal = (msg: any): msg is ClientSignal => {
  return (
    msg &&
    typeof msg === 'object' &&
    [
      'create_room',
      'join_room',
      'offer',
      'answer',
      'ice_candidate',
      'disconnect',
    ].includes(msg.type)
  );
};

export const isServerSignal = (msg: any): msg is ServerSignal => {
  return (
    msg &&
    typeof msg === 'object' &&
    [
      'room_created',
      'room_joined',
      'peer_joined',
      'offer',
      'answer',
      'ice_candidate',
      'error',
      'peer_disconnected',
    ].includes(msg.type)
  );
};

// Helper functions to create typed IDs
export function createRoomId(id: string): RoomId {
  return id as RoomId;
}

export function createPeerId(id: string): PeerId {
  return id as PeerId;
}
