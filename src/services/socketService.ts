import { ClientMessage, ServerMessage } from '../types';

class SocketService {
  private socket: WebSocket | null = null;
  private listeners: ((msg: ServerMessage) => void)[] = [];
  private url: string;

  constructor() {
    // Determine WS URL based on current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    
    // Detect local environment safely (including localhost, 127.0.0.1, and LAN IPs)
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    host.startsWith('10.') ||
                    host.startsWith('192.168.') ||
                    host.startsWith('172.');

    // If local dev (including LAN), connect directly to backend port 3001 with same host
    // Otherwise (production), use the relative /ws path proxied by Nginx
    this.url = isLocal ? `${protocol}//${host}:3001` : `${protocol}//${window.location.host}/ws`;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log('Connected to Orbital Link');
        };

        this.socket.onerror = (e) => {
           console.error('Socket Error:', e);
        };

        this.socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as ServerMessage;
            this.listeners.forEach(cb => cb(msg));
          } catch (e) {
            console.error('Failed to parse WS message', e);
          }
        };

        this.socket.onclose = () => {
          console.log('Orbital Link Lost. Reconnecting...');
          this.socket = null;
          setTimeout(() => this.connect(), 3000);
        };
    } catch (e) {
        console.error('Failed to initialize WebSocket:', e);
        // Retry logic for initial connection failures
        setTimeout(() => this.connect(), 3000);
    }
  }

  send(msg: ClientMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  subscribe(callback: (msg: ServerMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();