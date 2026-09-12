"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: "connected" | "connecting" | "disconnected";
  joinIncident: (incidentId: string) => void;
  leaveIncident: (incidentId: string) => void;
  joinDashboard: () => void;
  leaveDashboard: () => void;
  reconnectEpoch: number; // Incremented on every reconnect to trigger authoritative REST refetch
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    const s = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    s.on("connect", () => {
      setIsConnected(true);
      setConnectionStatus("connected");
      if (hasConnectedOnce.current) {
        // This is a RECONNECT event! Trigger epoch increment so consumers do full REST refetch
        setReconnectEpoch((prev) => prev + 1);
      }
      hasConnectedOnce.current = true;
    });

    s.on("disconnect", (reason) => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    });

    s.on("connect_error", () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    });

    s.on("reconnect_attempt", () => {
      setConnectionStatus("connecting");
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  const joinIncident = useCallback(
    (incidentId: string) => {
      if (socket && socket.connected) {
        socket.emit("join:incident", { incidentId });
      }
    },
    [socket]
  );

  const leaveIncident = useCallback(
    (incidentId: string) => {
      if (socket && socket.connected) {
        socket.emit("leave:incident", { incidentId });
      }
    },
    [socket]
  );

  const joinDashboard = useCallback(() => {
    if (socket && socket.connected) {
      socket.emit("join:dashboard");
    }
  }, [socket]);

  const leaveDashboard = useCallback(() => {
    if (socket && socket.connected) {
      socket.emit("leave:dashboard");
    }
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        connectionStatus,
        joinIncident,
        leaveIncident,
        joinDashboard,
        leaveDashboard,
        reconnectEpoch,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}

