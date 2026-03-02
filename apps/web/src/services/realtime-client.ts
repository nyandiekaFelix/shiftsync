import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

function resolveSocketUrl(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  if (apiUrl.startsWith("/")) {
    return window.location.origin;
  }

  return apiUrl.replace(/\/api\/v\d+$/, "").replace(/\/$/, "");
}

export function getRealtimeSocket(): Socket {
  if (socket) {
    return socket;
  }

  socket = io(resolveSocketUrl(), {
    withCredentials: true,
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  return socket;
}

export function closeRealtimeSocket(): void {
  socket?.close();
  socket = null;
}
