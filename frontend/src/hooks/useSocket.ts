import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getAuthToken } from "../lib/authStorage";

const API_BASE =
  ((import.meta as any).env.VITE_API_BASE as string) ||
  "http://localhost:5000";

// Strip /api suffix if present to get the base URL for socket connection
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, "");

interface UseSocketOptions {
  /** Socket.IO namespace, e.g. "/monitor" or "/exam" */
  namespace: string;
  /** Auto-connect on mount. Default: true */
  autoConnect?: boolean;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

/**
 * React hook for Socket.IO connections with JWT authentication.
 *
 * Usage:
 *   const { socket, isConnected } = useSocket({ namespace: "/monitor" });
 *
 * The hook automatically:
 *   - Reads the JWT from auth storage
 *   - Connects with auth token in handshake
 *   - Reconnects on disconnect
 *   - Cleans up on unmount
 */
export function useSocket({
  namespace,
  autoConnect = true,
}: UseSocketOptions): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = getAuthToken();
    if (!token) {
      console.warn("[useSocket] No auth token found, cannot connect");
      return;
    }

    const socket = io(`${SOCKET_BASE}${namespace}`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log(`[useSocket] Connected to ${namespace}`);
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[useSocket] Disconnected from ${namespace}: ${reason}`);
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.warn(`[useSocket] Connection error on ${namespace}:`, err.message);
      setIsConnected(false);
    });

    socketRef.current = socket;
  }, [namespace]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
  };
}
