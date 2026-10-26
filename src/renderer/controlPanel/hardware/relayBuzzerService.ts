/**
 * RelayBuzzerService — Direct Hardware USB Relay Driver (LCUS-1 / CH340)
 * 
 * Uses Chromium's native Web Serial API (`navigator.serial`) directly inside Electron
 * and modern browsers. ZERO localhost, ZERO Python, ZERO background server required!
 */

export interface RelayBuzzerConfig {
  enabled: boolean;
  durationSeconds: number; // Deprecated: use periodEndDurationSeconds/shotClockDurationSeconds
  wiringMode: 'NO' | 'NC';
  triggerOnPeriodEnd: boolean;
  triggerOnShotClock: boolean;
  triggerOnManual: boolean;
  periodEndDurationSeconds: number; // NBA standard: 3.0 seconds
  shotClockDurationSeconds: number; // NBA standard: 1.5 seconds
}

export interface RelayBuzzerState {
  connected: boolean;
  connecting: boolean;
  portInfo: string;
  isBuzzing: boolean;
  config: RelayBuzzerConfig;
  error: string | null;
  eventHistory?: BuzzerEvent[];
  stats?: BuzzerStats;
  connectionUptime?: number;
  bridgeConnected?: boolean;
  bridgeClientsCount?: number;
}

export interface BuzzerEvent {
  timestamp: Date;
  source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL';
  duration: number;
  success: boolean;
}

export interface BuzzerStats {
  totalPeriodEnd: number;
  totalShotClock: number;
  totalManual: number;
  lastTrigger: BuzzerEvent | null;
}

const STORAGE_KEY = 'ligacontrol_relay_buzzer_config';

const DEFAULT_CONFIG: RelayBuzzerConfig = {
  enabled: true,
  durationSeconds: 3.0,
  wiringMode: 'NC',
  triggerOnPeriodEnd: true,
  triggerOnShotClock: true,
  triggerOnManual: true,
  periodEndDurationSeconds: 3.0,
  shotClockDurationSeconds: 1.5,
};

// LCUS-1 Protocol Hex Commands:
// 0xA0 0x01 0x01 0xA2 -> Relay Coil ON
// 0xA0 0x01 0x00 0xA1 -> Relay Coil OFF
const CMD_RELAY_ON = new Uint8Array([0xA0, 0x01, 0x01, 0xA2]);
const CMD_RELAY_OFF = new Uint8Array([0xA0, 0x01, 0x00, 0xA1]);

type StateListener = (state: RelayBuzzerState) => void;

class RelayBuzzerService {
  private config: RelayBuzzerConfig = { ...DEFAULT_CONFIG };
  private port: any = null;
  private writer: any = null;
  private connected = false;
  private connecting = false;
  private portInfo = '';
  private isBuzzing = false;
  private error: string | null = null;
  private listeners: Set<StateListener> = new Set();
  private buzzTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHistory: BuzzerEvent[] = [];
  private stats: BuzzerStats = {
    totalPeriodEnd: 0,
    totalShotClock: 0,
    totalManual: 0,
    lastTrigger: null,
  };
  private connectionStartTime: number | null = null;
  private bridgeConnected = false;
  private bridgeClientsCount = 0;
  private lastTriggerTimestamp: Record<string, number> = {};

  constructor() {
    this.loadConfig();
    void this.initAutoConnect();
    this.initBridgeListener();
  }

  private initBridgeListener(): void {
    if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
      let lastGameClockMs: number | null = null;
      let lastShotClockMs: number | null = null;
      let lastPeriodBuzzerTime = 0;
      let lastShotClockBuzzerTime = 0;

      window.electron.ipcRenderer.on('scoreboard:event', (...args: any[]) => {
        // Preload exposes: ipcRenderer.on(channel, (_event, ...args) => listener(...args))
        // So the actual payload is args[0]
        const payload = (args[0]?.type ? args[0] : (args[1]?.type ? args[1] : args[0])) as any;
        if (!payload || !payload.type) return;

        if (payload.type === 'RELAY_BRIDGE_STATUS') {
          this.bridgeConnected = !!payload.connected;
          this.bridgeClientsCount = payload.clientsCount || 0;
          this.notify();
        } else if (payload.type === 'BUZZER_END_PERIOD') {
          console.log('[RelayBuzzer] 🚨 Received BUZZER_END_PERIOD event from Scoreboard');
          lastPeriodBuzzerTime = Date.now();
          this.triggerBuzzer('PERIOD_END');
        } else if (payload.type === 'BUZZER_SHOT_CLOCK') {
          console.log('[RelayBuzzer] 🚨 Received BUZZER_SHOT_CLOCK event from Scoreboard');
          lastShotClockBuzzerTime = Date.now();
          this.triggerBuzzer('SHOT_CLOCK');
        }
      });

      // Direct state listener fallback for 00:00 period expiration and 00.0 shot clock violation
      window.electron.ipcRenderer.on('scoreboard:state', (...args: any[]) => {
        const state = (args[0]?.gameClock ? args[0] : (args[1]?.gameClock ? args[1] : null)) as any;
        if (!state) return;

        // 1. Period end (00:00) check
        if (state.gameClock) {
          const currentMs = state.gameClock.displayMs;
          if (lastGameClockMs !== null && lastGameClockMs > 0 && currentMs <= 0) {
            const now = Date.now();
            if (now - lastPeriodBuzzerTime > 1500) {
              console.log('[RelayBuzzer] 🚨 Direct state 00:00 transition detected, triggering PERIOD_END buzzer...');
              lastPeriodBuzzerTime = now;
              this.triggerBuzzer('PERIOD_END');
            }
          }
          lastGameClockMs = currentMs;
        }

        // 2. Shot clock violation (0.0s) check
        if (state.shotClock) {
          const shotMs = state.shotClock.displayMs;
          const isEnabled = state.shotClock.enabled !== false;
          if (isEnabled && lastShotClockMs !== null && lastShotClockMs > 0 && shotMs <= 0) {
            const now = Date.now();
            if (now - lastShotClockBuzzerTime > 1500) {
              console.log('[RelayBuzzer] 🚨 Direct state shot clock 00.0 transition detected, triggering SHOT_CLOCK buzzer...');
              lastShotClockBuzzerTime = now;
              this.triggerBuzzer('SHOT_CLOCK');
            }
          }
          lastShotClockMs = shotMs;
        }
      });

      // Fetch initial status from main process bridge
      void window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'GET_RELAY_BRIDGE_STATUS',
      }).then((res: any) => {
        if (res?.success) {
          this.bridgeConnected = (res.webClientsCount || 0) > 0;
          this.bridgeClientsCount = res.webClientsCount || 0;
          this.notify();
        }
      }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Config Persistence
  // ---------------------------------------------------------------------------

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.durationSeconds && !parsed.periodEndDurationSeconds) {
          parsed.periodEndDurationSeconds = parsed.durationSeconds;
          parsed.shotClockDurationSeconds = parsed.durationSeconds * 0.5;
        }
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
      // Ensure defaults for essential trigger settings
      if (this.config.enabled === undefined) this.config.enabled = true;
      if (this.config.triggerOnPeriodEnd === undefined) this.config.triggerOnPeriodEnd = true;
      if (this.config.triggerOnShotClock === undefined) this.config.triggerOnShotClock = true;
      if (this.config.triggerOnManual === undefined) this.config.triggerOnManual = true;
      if (!this.config.shotClockDurationSeconds || this.config.shotClockDurationSeconds <= 0) {
        this.config.shotClockDurationSeconds = 1.5;
      }
    } catch (e) {
      console.warn('[RelayBuzzer] Failed to load config from localStorage:', e);
    }
  }

  public saveConfig(newConfig: Partial<RelayBuzzerConfig>): void {
    const modeChanged = newConfig.wiringMode !== undefined && newConfig.wiringMode !== this.config.wiringMode;
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('[RelayBuzzer] Failed to save config to localStorage:', e);
    }
    if (this.connected && !this.isBuzzing && modeChanged) {
      void this.setIdleState();
    }
    this.notify();
  }

  public getConfig(): RelayBuzzerConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  public getState(): RelayBuzzerState {
    const uptime = this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
    return {
      connected: this.connected,
      connecting: this.connecting,
      portInfo: this.portInfo,
      isBuzzing: this.isBuzzing,
      config: { ...this.config },
      error: this.error,
      eventHistory: [...this.eventHistory],
      stats: { ...this.stats },
      connectionUptime: uptime,
      bridgeConnected: this.bridgeConnected,
      bridgeClientsCount: this.bridgeClientsCount,
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  // ---------------------------------------------------------------------------
  // Web Serial Direct Hardware Connection
  // ---------------------------------------------------------------------------

  private async initAutoConnect(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return;
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        const port = ports[0];
        await port.open({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        });
        this.port = port;
        this.writer = port.writable.getWriter();
        this.connected = true;
        this.portInfo = 'USB Serial (Auto)';
        this.connectionStartTime = Date.now();
        await this.setIdleState();
        console.log('[RelayBuzzer] Auto-reconnected to paired USB Relay module');
        this.notify();
      }
    } catch (e) {
      console.log('[RelayBuzzer] No auto-connected serial port found:', e);
    }
  }

  public async connect(): Promise<boolean> {
    if (this.connected && this.writer) return true;

    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      this.error = 'Web Serial API is not supported in this browser. Please use Chrome or Edge.';
      this.notify();
      return false;
    }

    // Cleanly release any stale previous port or lock before opening a new connection
    await this.disconnect();

    this.connecting = true;
    this.error = null;
    this.notify();

    try {
      // Specifically target CH340 / USB Serial relay chips
      const filters = [
        { usbVendorId: 0x1a86 }, // WCH CH340 (User's USB LCUS-1 Relay)
        { usbVendorId: 0x10c4 }, // CP210x
        { usbVendorId: 0x0403 }, // FTDI
      ];
      let port: any;
      try {
        port = await (navigator as any).serial.requestPort({ filters });
      } catch (_fErr: any) {
        // Fallback to unfiltered requestPort
        port = await (navigator as any).serial.requestPort();
      }

      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      this.port = port;
      this.writer = port.writable.getWriter();
      this.connected = true;
      this.connecting = false;
      this.error = null;
      this.portInfo = 'USB Serial CH340 (COM13)';
      this.connectionStartTime = Date.now();

      // Listen for physical unplug
      port.addEventListener?.('disconnect', () => {
        void this.disconnect('USB Relay was unplugged');
      });

      // Set idle state initially (Siren silent in NC mode)
      await this.setIdleState();

      console.log('[RelayBuzzer] Connected directly to USB Relay via Web Serial');
      this.notify();
      return true;
    } catch (err: any) {
      this.connecting = false;
      if (err?.name === 'NotFoundError' || err?.message?.includes('No port selected')) {
        this.error = 'Unable to connect to USB port. If the Vercel console is open in Chrome, click "✕ Disconnect" there first before connecting here.';
      } else if (err?.message?.includes('Failed to open') || err?.name === 'NetworkError') {
        this.error = 'USB port is currently locked by another application. Please disconnect any other serial monitors or browser tabs.';
      } else {
        this.error = err?.message || 'Unable to connect to USB Relay. Please check the USB cable connection.';
      }
      console.warn('[RelayBuzzer] Connect error:', err);
      this.notify();
      return false;
    }
  }

  public async disconnect(reason?: string): Promise<void> {
    try {
      if (this.buzzTimer) {
        clearTimeout(this.buzzTimer);
        this.buzzTimer = null;
      }
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {}
        this.writer = null;
      }
      if (this.port) {
        try {
          await this.port.close();
        } catch (e) {}
        this.port = null;
      }
    } catch (e) {
      console.warn('[RelayBuzzer] Error during disconnect:', e);
    } finally {
      this.handleDisconnect(reason);
    }
  }

  private handleDisconnect(reason?: string): void {
    if (this.buzzTimer) {
      clearTimeout(this.buzzTimer);
      this.buzzTimer = null;
    }
    this.connected = false;
    this.connecting = false;
    this.port = null;
    this.writer = null;
    this.portInfo = '';
    this.isBuzzing = false;
    this.connectionStartTime = null;
    if (reason) {
      this.error = reason;
      console.warn('[RelayBuzzer] Disconnected:', reason);
    }
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Relay Hardware States (NC Fail-Safe vs NO Standard)
  // ---------------------------------------------------------------------------

  private async setIdleState(): Promise<void> {
    if (!this.connected || !this.writer) return;
    try {
      if (this.config.wiringMode === 'NC') {
        // NC mode: Energize coil (0x01) -> opens contact -> Siren SILENT
        await this.writer.write(CMD_RELAY_ON);
      } else {
        // NO mode: De-energize coil (0x00) -> opens contact -> Siren SILENT
        await this.writer.write(CMD_RELAY_OFF);
      }
    } catch (err) {
      console.warn('[RelayBuzzer] Error setting idle state:', err);
    }
  }

  private async setAlarmState(): Promise<void> {
    if (!this.connected || !this.writer) return;
    try {
      if (this.config.wiringMode === 'NC') {
        // NC mode: De-energize coil (0x00) -> closes contact -> Siren SOUNDS
        await this.writer.write(CMD_RELAY_OFF);
      } else {
        // NO mode: Energize coil (0x01) -> closes contact -> Siren SOUNDS
        await this.writer.write(CMD_RELAY_ON);
      }
    } catch (err) {
      console.warn('[RelayBuzzer] Error setting alarm state:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Buzzer Pulse & Game Clock Triggers
  // ---------------------------------------------------------------------------

  public async pulse(durationSeconds?: number, source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL' = 'MANUAL'): Promise<boolean> {
    if (!this.config.enabled) return false;

    const duration = durationSeconds ?? this.config.durationSeconds ?? 3.0;
    const durationMs = Math.max(200, Math.round(duration * 1000));

    if (this.buzzTimer) {
      clearTimeout(this.buzzTimer);
      this.buzzTimer = null;
    }

    this.isBuzzing = true;
    this.error = null;
    this.notify();

    // 1. Forward trigger to Vercel Web Console Bridge
    if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
      void window.electron.ipcRenderer.invoke('scoreboard:query', {
        type: 'RELAY_BRIDGE_TRIGGER_BUZZ',
        payload: { duration, source }
      });
    }

    // 2. Direct hardware write if serial is connected directly
    if (this.connected && this.writer) {
      try {
        await this.setAlarmState();
        console.log(`[RelayBuzzer] Direct hardware buzzer sounding for ${duration}s...`);

        this.buzzTimer = setTimeout(async () => {
          try {
            await this.setIdleState();
            console.log('[RelayBuzzer] Direct hardware buzzer silenced.');
          } catch (err) {
            console.warn('[RelayBuzzer] Error resetting buzzer:', err);
          } finally {
            this.isBuzzing = false;
            this.buzzTimer = null;
            this.notify();
          }
        }, durationMs);

        return true;
      } catch (err: any) {
        console.error('[RelayBuzzer] Direct pulse error:', err);
        this.error = 'Failed to trigger direct relay: ' + (err?.message || 'unknown error');
        this.isBuzzing = false;
        this.notify();
        return false;
      }
    }

    // 3. If direct serial is not connected but Vercel Web Console bridge is active
    if (this.bridgeConnected) {
      console.log(`[RelayBuzzer] Buzzer triggered via Vercel Web Console bridge (${duration}s, ${source})`);
      this.buzzTimer = setTimeout(() => {
        this.isBuzzing = false;
        this.buzzTimer = null;
        this.notify();
      }, durationMs);
      return true;
    }

    // If neither is connected
    this.buzzTimer = setTimeout(() => {
      this.isBuzzing = false;
      this.buzzTimer = null;
      this.notify();
    }, durationMs);
    return false;
  }

  public triggerBuzzer(source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL'): void {
    if (!this.config.enabled) {
      console.log('[RelayBuzzer] Trigger ignored: service disabled');
      return;
    }

    if (source === 'PERIOD_END' && this.config.triggerOnPeriodEnd === false) {
      console.log('[RelayBuzzer] Period end trigger disabled');
      return;
    }

    if (source === 'SHOT_CLOCK' && this.config.triggerOnShotClock === false) {
      console.log('[RelayBuzzer] Shot clock trigger disabled');
      return;
    }

    if (source === 'MANUAL' && this.config.triggerOnManual === false) {
      console.log('[RelayBuzzer] Manual trigger disabled');
      return;
    }

    // Debounce guard: prevent triggering same source within 800ms
    const now = Date.now();
    const lastTime = this.lastTriggerTimestamp[source] || 0;
    if (now - lastTime < 800) {
      console.log(`[RelayBuzzer] Ignored duplicate ${source} trigger (${now - lastTime}ms ago)`);
      return;
    }
    this.lastTriggerTimestamp[source] = now;

    let duration: number;
    if (source === 'PERIOD_END') {
      duration = this.config.periodEndDurationSeconds || this.config.durationSeconds || 3.0;
    } else if (source === 'SHOT_CLOCK') {
      duration = this.config.shotClockDurationSeconds || 1.5;
    } else {
      duration = this.config.periodEndDurationSeconds || this.config.durationSeconds || 3.0;
    }

    console.log(`[RelayBuzzer] Triggering ${source} buzzer for ${duration}s`, {
      connected: this.connected,
      bridgeConnected: this.bridgeConnected,
      wiringMode: this.config.wiringMode
    });

    this.logEvent(source, duration, this.connected || this.bridgeConnected);
    void this.pulse(duration, source);
  }

  public testBuzzer(): void {
    void this.pulse(this.config.periodEndDurationSeconds ?? this.config.durationSeconds ?? 3.0, 'MANUAL');
  }

  // ---------------------------------------------------------------------------
  // Diagnostics & Event Logs
  // ---------------------------------------------------------------------------

  private logEvent(source: 'PERIOD_END' | 'SHOT_CLOCK' | 'MANUAL', duration: number, success: boolean): void {
    const event: BuzzerEvent = {
      timestamp: new Date(),
      source,
      duration,
      success,
    };

    this.eventHistory.unshift(event);
    if (this.eventHistory.length > 10) {
      this.eventHistory.pop();
    }

    if (source === 'PERIOD_END') this.stats.totalPeriodEnd++;
    else if (source === 'SHOT_CLOCK') this.stats.totalShotClock++;
    else if (source === 'MANUAL') this.stats.totalManual++;
    
    this.stats.lastTrigger = event;
    this.notify();
  }

  public getEventHistory(): BuzzerEvent[] {
    return [...this.eventHistory];
  }

  public getStats(): BuzzerStats {
    return { ...this.stats };
  }

  public async testConnection(): Promise<boolean> {
    if (!this.connected || !this.writer) {
      console.log('[RelayBuzzer] Test connection: Not connected');
      return false;
    }
    try {
      console.log('[RelayBuzzer] Testing USB relay connection...');
      await this.setAlarmState();
      await new Promise((r) => setTimeout(r, 250));
      await this.setIdleState();
      console.log('[RelayBuzzer] Connection test successful');
      return true;
    } catch (err: any) {
      console.error('[RelayBuzzer] Connection test failed:', err);
      this.error = 'Connection test failed: ' + (err?.message || 'unknown error');
      this.notify();
      return false;
    }
  }

  public getConnectionUptime(): number {
    return this.connectionStartTime ? Date.now() - this.connectionStartTime : 0;
  }
}

export const relayBuzzerService = new RelayBuzzerService();
