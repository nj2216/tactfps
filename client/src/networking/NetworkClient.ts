import type { ClientMessage, ServerMessage } from '../../../shared/types';

export class NetworkClient {
  private socket: WebSocket;

  constructor(url: string, onMessage: (message: ServerMessage) => void, onStatus: (status: string) => void) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => onStatus('Connected. Joining match…'));
    this.socket.addEventListener('error', () => onStatus('Unable to connect. Check server IP, port, LAN, and firewall.'));
    this.socket.addEventListener('close', () => onStatus('Disconnected from server.'));
    this.socket.addEventListener('message', (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        onMessage(message);
      } catch {
        onStatus('Received an invalid server message.');
      }
    });
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }
}
