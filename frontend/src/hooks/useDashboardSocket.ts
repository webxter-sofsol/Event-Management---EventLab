import { useEffect, useRef } from 'react';
import { getAccessToken } from '../api/axiosInstance';

export interface EventStats {
  event_id: string;
  name: string;
  capacity: number;
  confirmed: number;
  available_seats: number;
  status: string;
  alert_triggered: boolean;
}

type UpdateCallback = (stats: EventStats) => void;

const WS_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000')
  .replace(/^http/, 'ws');

/**
 * Connects to the dashboard WebSocket and calls `onUpdate` whenever
 * the server broadcasts updated event stats. Reconnects automatically
 * on unexpected close (up to maxRetries times).
 */
export function useDashboardSocket(onUpdate: UpdateCallback, maxRetries = 5) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retries = 0;
    let stopped = false;

    function connect() {
      const token = getAccessToken();
      const url = token
        ? `${WS_BASE_URL}/ws/dashboard/?token=${encodeURIComponent(token)}`
        : `${WS_BASE_URL}/ws/dashboard/`;

      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        try {
          const data: EventStats = JSON.parse(event.data);
          onUpdateRef.current(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = (e) => {
        if (stopped) return;
        // 1000 = normal close, 1001 = going away — don't retry
        if (e.code === 1000 || e.code === 1001) return;
        if (retries < maxRetries) {
          retries++;
          const delay = Math.min(1000 * 2 ** retries, 30_000);
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      ws?.close(1000, 'component unmounted');
    };
  }, [maxRetries]);
}
