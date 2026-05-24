/**
 * Scale (Timbangan Digital) Service Layer.
 * Saat ini menggunakan dummy simulation.
 * Di masa depan, ganti implementasi connect() dan readWeight() untuk integrasi:
 *  - Serial Port (Web Serial API)
 *  - Bluetooth (Web Bluetooth API)
 *  - REST endpoint dari gateway IoT
 *
 * Endpoint contract (siap dipakai):
 *   POST /api/scale/connect  -> { status: "connected", deviceId }
 *   GET  /api/scale/read     -> { weight: number, unit: "kg", timestamp }
 *   POST /api/scale/tare     -> { status: "ok" }
 */
import { COMMODITIES } from "./seed";

export type ScaleStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ScaleReading {
  weight: number;
  unit: "kg";
  timestamp: string;
  deviceId: string;
}

class ScaleService {
  status: ScaleStatus = "disconnected";
  deviceId = "";
  private listeners = new Set<(s: ScaleStatus) => void>();

  onStatus(cb: (s: ScaleStatus) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(s: ScaleStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  async connect(): Promise<boolean> {
    this.setStatus("connecting");
    await new Promise((r) => setTimeout(r, 900));
    this.deviceId = "SCALE-DUMMY-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    this.setStatus("connected");
    return true;
  }

  disconnect() {
    this.deviceId = "";
    this.setStatus("disconnected");
  }

  /** Simulasi pembacaan berat. Range tergantung jenis komoditas. */
  async readWeight(komoditasId?: string): Promise<ScaleReading> {
    if (this.status !== "connected") throw new Error("Timbangan belum terhubung.");
    await new Promise((r) => setTimeout(r, 600));
    const ranges: Record<string, [number, number]> = {
      beras: [150, 350],
      "bawang-merah": [60, 200],
      "bawang-putih": [40, 120],
      cabai: [30, 150],
    };
    const c = komoditasId ?? COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)].id;
    const [min, max] = ranges[c] ?? [50, 250];
    const weight = Math.round((min + Math.random() * (max - min)) * 10) / 10;
    return {
      weight,
      unit: "kg",
      timestamp: new Date().toISOString(),
      deviceId: this.deviceId,
    };
  }

  /** Dummy AI detection label. */
  detectLabel(komoditasId: string): string {
    const map: Record<string, string[]> = {
      beras: ["Beras Medium", "Beras Premium", "Beras IR-64"],
      "bawang-merah": ["Bawang Merah Brebes", "Bawang Merah Lokal"],
      "bawang-putih": ["Bawang Putih Kating", "Bawang Putih Sin Chung"],
      cabai: ["Cabai Merah Keriting", "Cabai Rawit Merah", "Cabai Besar"],
    };
    const arr = map[komoditasId] ?? ["Komoditas"];
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

export const scaleService = new ScaleService();
