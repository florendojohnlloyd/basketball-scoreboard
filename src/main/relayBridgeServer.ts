/**
 * relayBridgeServer.ts — Hybrid Cloud MQTT & Local WebSocket Bridge for Vercel Web Console
 *
 * Allows the Scoreboard App and the Vercel Web Console (relay-web-console.vercel.app)
 * to communicate in real-time. When the user connects their physical USB Relay on
 * the Vercel website in Chrome/Edge, this bridge forwards all game clock (00:00)
 * and shot clock buzzer events directly to the website to sound the physical siren!
 *
 * Features:
 *  1. Cloud MQTT Bridge (HiveMQ WSS / EMQX WSS): Works seamlessly from Vercel's HTTPS
 *     origin with zero mixed-content or PNA restrictions, providing sub-50ms latency.
 *  2. Local WebSocket & HTTP Server (127.0.0.1:8765): Works offline and serves the web
 *     console locally when opened via http://localhost:8765.
 *  3. Bidirectional Presence: Scoreboard automatically detects active Vercel browsers.
 */

import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as mqtt from 'mqtt';

export interface RelayBridgeBuzzEvent {
  type: 'BUZZ';
  duration: number;
  source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL';
  timestamp: number;
}

export type BridgeStatusCallback = (status: {
  bridgeRunning: boolean;
  webClientsCount: number;
  cloudConnected?: boolean;
  cloudClientsCount?: number;
  lastBuzzTime?: number;
}) => void;

export class RelayBridgeServer {
  private server: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private port = 8765;
  private clients: Set<WebSocket> = new Set();
  private statusCallbacks: Set<BridgeStatusCallback> = new Set();
  private pendingBuzzes: RelayBridgeBuzzEvent[] = [];
  private lastBuzzTime = 0;

  // Cloud MQTT Bridge settings (HiveMQ public WSS broker with valid CA certificate)
  private mqttClient: mqtt.MqttClient | null = null;
  private mqttTopicBuzz = 'ligacontrol/relay/florendo';
  private mqttTopicStatus = 'ligacontrol/relay/florendo/status';
  private cloudConnected = false;
  private cloudClients: Map<string, number> = new Map();
  private pruneTimer: NodeJS.Timeout | null = null;

  public start(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // 1. Initialize Cloud MQTT Bridge for Vercel
        this.initCloudMqtt();

        // 2. Setup periodic pruning of expired cloud browser clients (heartbeat timeout: 9s)
        this.pruneTimer = setInterval(() => {
          const now = Date.now();
          let changed = false;
          for (const [clientId, lastSeen] of this.cloudClients.entries()) {
            if (now - lastSeen > 9000) {
              this.cloudClients.delete(clientId);
              changed = true;
              console.log(`[RelayBridge] Vercel Web Console client ${clientId} expired (heartbeat timeout)`);
            }
          }
          if (changed) {
            this.notifyStatus();
          }
        }, 3000);

        // 3. Setup Local HTTP & Static File Server
        this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
          // Enable CORS for Vercel app & local dev
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Private-Network');
          res.setHeader('Access-Control-Allow-Private-Network', 'true');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          const rawUrl = req.url || '/';
          const url = rawUrl.split('?')[0];

          if (url === '/health' || url === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'online',
              service: 'Scoreboard Relay Bridge',
              webClients: this.getWebClientsCount(),
              cloudConnected: this.cloudConnected,
              cloudClients: this.cloudClients.size,
              localClients: this.clients.size,
              lastBuzzTime: this.lastBuzzTime,
            }));
            return;
          }

          // Polling fallback endpoint for browser if WS is blocked
          if (url === '/api/pending-buzz') {
            const events = [...this.pendingBuzzes];
            this.pendingBuzzes = [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ events }));
            return;
          }

          // Static serving of relay-web-console locally
          if (url === '/' || url === '/index.html' || url === '/mqtt.min.js') {
            const served = this.serveStaticFile(url === '/' ? '/index.html' : url, res);
            if (served) return;
          }

          res.writeHead(404);
          res.end('Not Found');
        });

        // 4. Setup Local WebSocket Server
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('error', (err: any) => {
          console.warn('[RelayBridge] WebSocketServer warning/error:', err?.message || err);
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.clients.add(ws);
          console.log(`[RelayBridge] Local Web Console connected! Total local clients: ${this.clients.size}`);
          this.notifyStatus();

          // Send welcome message
          ws.send(JSON.stringify({
            type: 'WELCOME',
            message: 'Connected to Scoreboard Relay Bridge',
            timestamp: Date.now(),
          }));

          ws.on('message', (data: any) => {
            try {
              const msg = JSON.parse(data.toString());
              if (msg.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
              } else if (msg.type === 'RELAY_STATE') {
                console.log('[RelayBridge] Local console relay status update:', msg);
              }
            } catch (err) {
              console.warn('[RelayBridge] Error parsing WS message:', err);
            }
          });

          ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[RelayBridge] Local Web Console disconnected. Remaining clients: ${this.clients.size}`);
            this.notifyStatus();
          });

          ws.on('error', (err) => {
            console.warn('[RelayBridge] WS Client error:', err.message);
            this.clients.delete(ws);
            this.notifyStatus();
          });
        });

        this.server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[RelayBridge] Port ${this.port} is already in use. Local bridge disabled; Cloud MQTT bridge remains active.`);
            try {
              this.wss?.close();
            } catch {}
            this.wss = null;
            this.server = null;
          } else {
            console.error('[RelayBridge] Server error:', err);
          }
          resolve(false);
        });

        this.server.listen(this.port, '127.0.0.1', () => {
          console.log(`[RelayBridge] Local WebSocket Bridge running on ws://127.0.0.1:${this.port}`);
          this.notifyStatus();
          resolve(true);
        });
      } catch (e) {
        console.error('[RelayBridge] Failed to start bridge server:', e);
        resolve(false);
      }
    });
  }

  private initCloudMqtt(): void {
    const brokers = [
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://broker.emqx.io:8084/mqtt',
    ];
    let brokerIndex = 0;

    const connectToBroker = (url: string) => {
      try {
        console.log(`[RelayBridge] Connecting to Cloud MQTT Broker: ${url}...`);
        this.mqttClient = mqtt.connect(url, {
          clientId: 'scoreboard_' + Math.random().toString(16).substring(2, 10),
          clean: true,
          connectTimeout: 8000,
          reconnectPeriod: 4000,
        });

        this.mqttClient.on('connect', () => {
          this.cloudConnected = true;
          console.log(`[RelayBridge] Connected to Cloud MQTT Broker for Vercel Console! (${url})`);
          this.mqttClient?.subscribe(this.mqttTopicStatus, (err) => {
            if (!err) {
              console.log(`[RelayBridge] Subscribed to Vercel presence topic: ${this.mqttTopicStatus}`);
            }
          });
          this.notifyStatus();
        });

        this.mqttClient.on('message', (topic: string, message: Buffer) => {
          if (topic === this.mqttTopicStatus) {
            try {
              const data = JSON.parse(message.toString());
              const clientId = data.clientId || 'web_console';
              const wasPresent = this.cloudClients.has(clientId);
              this.cloudClients.set(clientId, Date.now());
              if (!wasPresent) {
                console.log(`[RelayBridge] ⚡ Vercel Web Console connected via Cloud MQTT! (ID: ${clientId}, Relay: ${data.relayConnected ? 'CONNECTED' : 'DISCONNECTED'})`);
              }
              this.notifyStatus();
            } catch (err) {
              console.warn('[RelayBridge] Error parsing MQTT presence message:', err);
            }
          }
        });

        this.mqttClient.on('error', (err: Error) => {
          console.warn(`[RelayBridge] Cloud MQTT error (${url}):`, err.message);
          // Try next broker if HiveMQ fails
          if (brokerIndex < brokers.length - 1) {
            brokerIndex++;
            try { this.mqttClient?.end(true); } catch {}
            setTimeout(() => connectToBroker(brokers[brokerIndex]), 2000);
          }
        });

        this.mqttClient.on('close', () => {
          if (this.cloudConnected) {
            this.cloudConnected = false;
            console.log('[RelayBridge] Cloud MQTT connection closed.');
            this.notifyStatus();
          }
        });
      } catch (err) {
        console.warn('[RelayBridge] Failed to establish MQTT client:', err);
      }
    };

    connectToBroker(brokers[0]);
  }

  private serveStaticFile(relativeUrl: string, res: ServerResponse): boolean {
    const filename = relativeUrl.replace(/^\//, '');
    const searchDirs = [
      path.resolve(process.cwd(), '../relay-web-console'),
      path.resolve(process.cwd(), 'relay-web-console'),
      path.resolve(__dirname, '../../../../relay-web-console'),
      path.resolve(__dirname, '../../../relay-web-console'),
    ];

    for (const dir of searchDirs) {
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const contentType = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : 'text/plain';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
          return true;
        } catch {
          // continue search
        }
      }
    }
    return false;
  }

  public stop(): void {
    try {
      if (this.pruneTimer) {
        clearInterval(this.pruneTimer);
        this.pruneTimer = null;
      }

      if (this.mqttClient) {
        try { this.mqttClient.end(true); } catch {}
        this.mqttClient = null;
      }
      this.cloudConnected = false;
      this.cloudClients.clear();

      this.clients.forEach((c) => {
        try { c.close(); } catch {}
      });
      this.clients.clear();
      this.wss?.close();
      this.server?.close();
      this.server = null;
      this.wss = null;
      this.notifyStatus();
    } catch (e) {
      console.warn('[RelayBridge] Error stopping bridge:', e);
    }
  }

  public triggerBuzz(duration = 3.0, source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL' = 'PERIOD_END'): void {
    const event: RelayBridgeBuzzEvent = {
      type: 'BUZZ',
      duration,
      source,
      timestamp: Date.now(),
    };

    this.lastBuzzTime = event.timestamp;
    this.pendingBuzzes.push(event);
    if (this.pendingBuzzes.length > 5) {
      this.pendingBuzzes.shift();
    }

    const payload = JSON.stringify(event);

    // 1. Broadcast to local WebSocket clients
    let localSent = 0;
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
          localSent++;
        } catch (e) {
          console.warn('[RelayBridge] Error sending to WS client:', e);
        }
      }
    });

    // 2. Broadcast to Vercel Web Console via Cloud MQTT
    let cloudSent = false;
    if (this.mqttClient) {
      try {
        this.mqttClient.publish(this.mqttTopicBuzz, payload, { qos: 1 }, (err) => {
          if (err) console.warn('[RelayBridge] MQTT publish callback error:', err);
          else console.log('[RelayBridge] MQTT BUZZ message delivered to broker topic:', this.mqttTopicBuzz);
        });
        cloudSent = true;
      } catch (e) {
        console.warn('[RelayBridge] Error publishing BUZZ to Cloud MQTT:', e);
      }
    }

    console.log(
      `[RelayBridge] Broadcasted BUZZ (${duration}s, ${source}) -> Local WS: ${localSent}, Cloud MQTT: ${cloudSent} (${this.cloudClients.size} Vercel browser[s])`
    );
    this.notifyStatus();
  }

  public getWebClientsCount(): number {
    return this.clients.size + this.cloudClients.size;
  }

  public isRunning(): boolean {
    return (this.server !== null && this.server.listening) || this.cloudConnected;
  }

  public onStatusChange(callback: BridgeStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback({
      bridgeRunning: this.isRunning(),
      webClientsCount: this.getWebClientsCount(),
      cloudConnected: this.cloudConnected,
      cloudClientsCount: this.cloudClients.size,
      lastBuzzTime: this.lastBuzzTime,
    });
    return () => this.statusCallbacks.delete(callback);
  }

  private notifyStatus(): void {
    const status = {
      bridgeRunning: this.isRunning(),
      webClientsCount: this.getWebClientsCount(),
      cloudConnected: this.cloudConnected,
      cloudClientsCount: this.cloudClients.size,
      lastBuzzTime: this.lastBuzzTime,
    };
    this.statusCallbacks.forEach((cb) => {
      try { cb(status); } catch {}
    });
  }
}

// Global singleton instance for the main process
export const relayBridgeServer = new RelayBridgeServer();

