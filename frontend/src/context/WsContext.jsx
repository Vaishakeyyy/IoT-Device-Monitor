import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const ws = useRef(null);
  const listeners = useRef([]);

  const connect = useCallback(() => {
    const url = (process.env.REACT_APP_WS_URL || "ws://localhost:5000") + "/ws";
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    socket.onerror = () => socket.close();
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        setLastMessage(msg);
        listeners.current.forEach((fn) => fn(msg));
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);

  const subscribe = useCallback((fn) => {
    listeners.current.push(fn);
    return () => { listeners.current = listeners.current.filter((f) => f !== fn); };
  }, []);

  return (
    <WsContext.Provider value={{ connected, lastMessage, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWs = () => useContext(WsContext);
