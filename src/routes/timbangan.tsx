import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { scaleService, type ScaleStatus } from "@/lib/scale-service";
import { COMMODITIES, MARKETS } from "@/lib/seed";
import { store } from "@/lib/storage";
import { useMounted } from "@/hooks/use-mounted";
import { useAuthUser } from "@/hooks/use-auth";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import {
  Camera,
  Plug,
  PlugZap,
  Scale as ScaleIcon,
  Upload,
  User,
  ShieldAlert,
  ShieldCheck,
  Flame,
  AlertTriangle,
  Play,
  UserPlus,
  Activity,
  Maximize2,
  ScanLine,
} from "lucide-react";
import type { WeighRecord } from "@/lib/types";

export const Route = createFileRoute("/timbangan")({ component: TimbanganPage });

// Beeper generator using Web Audio API for rich interactive response
const playBeep = (freq = 800, duration = 0.1) => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log("Audio feedback not supported or blocked by user gesture:", e);
  }
};

const COMMODITY_IMAGES: Record<string, string> = {
  beras: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop",
  "bawang-merah": "https://images.unsplash.com/photo-1620574387735-3624d75b2dbf?w=600&auto=format&fit=crop",
  "bawang-putih": "https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=600&auto=format&fit=crop",
  cabai: "https://images.unsplash.com/photo-1583286814358-7a47b62cd35b?w=600&auto=format&fit=crop",
};

interface Officer {
  id: string;
  name: string;
  role: string;
  pasarId: string;
  photoUrl: string;
  status: "Active" | "Away" | "Unverified";
}

function TimbanganPage() {
  return (
    <AppShell>
      <TimbanganInner />
    </AppShell>
  );
}

function TimbanganInner() {
  const mounted = useMounted();
  const { user } = useAuthUser();
  
  // IoT & Weigh Scale States
  const [scaleStatus, setScaleStatus] = useState<ScaleStatus>("disconnected");
  const [komoditas, setKomoditas] = useState("cabai");
  const [pasar, setPasar] = useState(MARKETS[0].id);
  const [petugas, setPetugas] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [isWeighing, setIsWeighing] = useState(false);
  const [timestamp, setTimestamp] = useState("");
  const [photo, setPhoto] = useState("");
  const [harga, setHarga] = useState<number>(COMMODITIES[3].basePrice);
  const [rows, setRows] = useState<WeighRecord[]>([]);

  // AI Vision Advanced Controls
  const [scanMode, setScanMode] = useState<"face" | "commodity" | "multi">("face");
  const [fraudMode, setFraudMode] = useState<"normal" | "no-officer" | "unknown-face">("normal");
  const [scanCommodityVal, setScanCommodityVal] = useState("cabai");
  const [cameraFlash, setCameraFlash] = useState(false);

  // Face Registration State
  const [regName, setRegName] = useState("");
  const [regRole, setRegRole] = useState("Petugas Timbang");
  const [regPasar, setRegPasar] = useState(MARKETS[0].id);
  const [regPhoto, setRegPhoto] = useState("");
  const [officers, setOfficers] = useState<Officer[]>([
    { id: "OFF-001", name: "Andi (BI)", role: "Bank Indonesia Analyst", pasarId: "jakabaring", photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop", status: "Active" },
    { id: "OFF-002", name: "Rina (BPS)", role: "BPS Surveyor", pasarId: "km5", photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop", status: "Active" },
    { id: "OFF-003", name: "Joko", role: "Petugas Timbang", pasarId: "jakabaring", photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop", status: "Away" },
    { id: "OFF-004", name: "Sari", role: "Dinas Pangan Staff", pasarId: "prabumulih", photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop", status: "Active" }
  ]);

  // Visual scan & Fraud Log Ticker
  const [activityLogs, setActivityLogs] = useState<string[]>([
    "[10:35:12] [AI Vision] Inisialisasi engine Face Recognition v2.4 ... Sukses.",
    "[10:35:15] [AI Vision] Face Verified: Andi (BI) (id: OFF-001) - Conf: 98.7% di Area Timbang.",
    "[10:35:30] [IoT Scale] Gateway timbangan terputus. Menunggu koneksi gateway USB/Bluetooth...",
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load baseline logs & weighs
  useEffect(() => {
    const off = scaleService.onStatus(setScaleStatus);
    setScaleStatus(scaleService.status);
    if (mounted) {
      setRows(store.weighs.get());
      if (user) {
        setPetugas(user.name);
        setRegName(user.name);
      }
    }
    return () => off();
  }, [mounted, user]);

  // Audio effects when states change
  useEffect(() => {
    if (fraudMode !== "normal") {
      playBeep(220, 0.4); // Warning low pitch beep
    } else {
      playBeep(880, 0.08); // Success high pitch beep
    }
    const log = `[${new Date().toLocaleTimeString("id-ID")}] [Anti-Fraud] Status Pengawasan berubah: ${
      fraudMode === "normal"
        ? "Petugas Terverifikasi (Normal)"
        : fraudMode === "no-officer"
          ? "PERINGATAN: Petugas Meninggalkan Area Timbang!"
          : "PERINGATAN KRITIS: Terdeteksi Wajah Asing / Potensi Fraud!"
    }`;
    setActivityLogs((prev) => [log, ...prev]);
  }, [fraudMode]);

  useEffect(() => {
    playBeep(600, 0.1);
    const log = `[${new Date().toLocaleTimeString("id-ID")}] [AI Vision] Mode Pemindaian Kamera diubah ke: ${
      scanMode === "face"
        ? "Face Recognition & Smart Presence Check"
        : scanMode === "commodity"
          ? "Commodity Classification & Quality Scanning"
          : "Multi-Object Sacks Detection Counter"
    }`;
    setActivityLogs((prev) => [log, ...prev]);
  }, [scanMode]);

  // HTML5 Interactive Canvas Animation Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;

    const drawCorners = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number, color: string) => {
      c.strokeStyle = color;
      c.lineWidth = 4;
      // Top-Left
      c.beginPath();
      c.moveTo(x + len, y);
      c.lineTo(x, y);
      c.lineTo(x, y + len);
      c.stroke();
      // Top-Right
      c.beginPath();
      c.moveTo(x + w - len, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w, y + len);
      c.stroke();
      // Bottom-Left
      c.beginPath();
      c.moveTo(x + len, y + h);
      c.lineTo(x, y + h);
      c.lineTo(x, y + h - len);
      c.stroke();
      // Bottom-Right
      c.beginPath();
      c.moveTo(x + w - len, y + h);
      c.lineTo(x + w, y + h);
      c.lineTo(x + w, y + h - len);
      c.stroke();
    };

    const drawDot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, outline = false) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      if (outline) {
        c.strokeStyle = "rgba(16, 185, 129, 0.6)";
        c.lineWidth = 2;
        c.stroke();
      } else {
        c.fill();
      }
    };

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Dark sci-fi background feed
      ctx.fillStyle = "#09101d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid overlays
      ctx.strokeStyle = "rgba(14, 165, 233, 0.05)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Tech scanlines background overlay
      ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
      for (let y = 0; y < canvas.height; y += 4) {
        if (Math.floor(y + frame) % 12 === 0) {
          ctx.fillRect(0, y, canvas.width, 2);
        }
      }

      // Bouncing target reticle in the middle
      ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 50 + Math.sin(frame / 12) * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 80, canvas.height / 2);
      ctx.lineTo(canvas.width / 2 + 80, canvas.height / 2);
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 80);
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 80);
      ctx.stroke();

      // RENDER MODE: FACE RECOGNITION
      if (scanMode === "face") {
        if (fraudMode === "normal") {
          // Normal verified state
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(220, 100, 200, 230);
          drawCorners(ctx, 220, 100, 200, 230, 20, "#10b981");

          ctx.fillStyle = "#10b981";
          ctx.font = "bold 13px monospace";
          ctx.fillText(`VERIFIED: ${petugas || "Andi (BI)"}`, 220, 90);
          ctx.fillText("STATUS: SECURE PRESENCE", 220, 350);
          ctx.fillText("CONFIDENCE: 98.7%", 220, 368);

          // Face mesh vertices simulation
          ctx.fillStyle = "rgba(16, 185, 129, 0.7)";
          drawDot(ctx, 290, 175, 4); // L eye
          drawDot(ctx, 350, 175, 4); // R eye
          drawDot(ctx, 320, 205, 4); // nose
          drawDot(ctx, 320, 255, 3); // mouth top
          drawDot(ctx, 320, 265, 12, true); // smile arc
          
          // Connect vertices with subtle green lines
          ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(290, 175); ctx.lineTo(320, 205);
          ctx.lineTo(350, 175); ctx.lineTo(320, 255);
          ctx.lineTo(290, 175); ctx.lineTo(320, 255);
          ctx.stroke();
        } else if (fraudMode === "unknown-face") {
          // Unknown face / Spoofing red alert
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3;
          ctx.strokeRect(220, 100, 200, 230);
          drawCorners(ctx, 220, 100, 200, 230, 20, "#ef4444");

          ctx.fillStyle = "#ef4444";
          ctx.font = "bold 13px monospace";
          ctx.fillText("⚠ ALERT: UNKNOWN PERSON DETECTED", 220, 90);
          ctx.fillText("SPOOFING SCAN: SUSPECTED", 220, 350);
          ctx.fillText("AI CONFIDENCE: 34.2%", 220, 368);

          // Red scrambled dots
          ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
          drawDot(ctx, 285 + Math.sin(frame) * 2, 170 + Math.cos(frame) * 2, 4);
          drawDot(ctx, 345 + Math.cos(frame) * 2, 170 + Math.sin(frame) * 2, 4);
          drawDot(ctx, 315 + Math.sin(frame) * 1.5, 200, 4);
        } else if (fraudMode === "no-officer") {
          // Red glowing screen when officer is absent
          ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

          ctx.fillStyle = "#ef4444";
          ctx.font = "bold 20px monospace";
          const yPos = canvas.height / 2 + Math.sin(frame / 8) * 12;
          ctx.textAlign = "center";
          ctx.fillText("⚠ WARNING: OFFICER OUT OF AREA", canvas.width / 2, yPos - 15);
          ctx.font = "13px monospace";
          ctx.fillText("AREA TIMBANG AKTIF TANPA PENGAWASAN (18 MENIT)", canvas.width / 2, yPos + 15);
          ctx.textAlign = "left";
        }
      } 
      // RENDER MODE: COMMODITY SCAN
      else if (scanMode === "commodity") {
        const visualName = COMMODITIES.find((c) => c.id === scanCommodityVal)?.name ?? "Cabai Merah";
        const isMismatch = scanCommodityVal !== komoditas;

        // Draw visual box
        ctx.strokeStyle = isMismatch ? "#ef4444" : "#0ea5e9";
        ctx.lineWidth = 3;
        ctx.strokeRect(170, 130, 300, 230);
        drawCorners(ctx, 170, 130, 300, 230, 20, isMismatch ? "#ef4444" : "#0ea5e9");

        ctx.fillStyle = isMismatch ? "#ef4444" : "#0ea5e9";
        ctx.font = "bold 13px monospace";
        ctx.fillText(`VISUAL SCAN: ${visualName.toUpperCase()}`, 170, 120);
        ctx.fillText(`QUALITY INDEX: ${scanCommodityVal === "cabai" ? "92.4% [BAIK]" : "94.6% [PREMIUM]"}`, 170, 385);
        ctx.fillText(`EST. CONDITION: SEGAR & KERING`, 170, 403);

        if (isMismatch) {
          ctx.fillStyle = "#ef4444";
          ctx.fillText("⚠ SYSTEM ALERT: CLASSIFICATION MISMATCH", 170, 425);
          
          // Draw bright exclamation point
          ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
          ctx.beginPath();
          ctx.arc(320, 235, 45, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ef4444";
          ctx.font = "bold 48px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("!", 320, 253);
          ctx.textAlign = "left";
        } else {
          // Glowing crosshair on scanned commodity
          ctx.strokeStyle = "rgba(14, 165, 233, 0.4)";
          ctx.strokeRect(300, 225, 40, 40);
        }
      }
      // RENDER MODE: MULTI OBJECT SACKS
      else if (scanMode === "multi") {
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 2.5;

        // Sack 1 Bounding box
        ctx.strokeRect(80, 180, 190, 220);
        drawCorners(ctx, 80, 180, 190, 220, 12, "#eab308");
        ctx.fillStyle = "#eab308";
        ctx.font = "bold 11px monospace";
        ctx.fillText("OBJECT #1: KARUNG BERAS (MEDIUM)", 80, 170);
        ctx.fillText("EST. WEIGHT: 25.4 kg", 80, 418);

        // Sack 2 Bounding box
        ctx.strokeStyle = "#eab308";
        ctx.strokeRect(370, 160, 190, 240);
        drawCorners(ctx, 370, 160, 190, 240, 12, "#eab308");
        ctx.fillText("OBJECT #2: KARUNG BERAS (PREMIUM)", 370, 150);
        ctx.fillText("EST. WEIGHT: 20.1 kg", 370, 418);

        // Header counts
        ctx.fillStyle = "rgba(234, 179, 8, 0.12)";
        ctx.fillRect(15, 15, 190, 45);
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 1;
        ctx.strokeRect(15, 15, 190, 45);
        ctx.fillStyle = "#eab308";
        ctx.fillText("MULTI-OBJECT MAPPING", 25, 32);
        ctx.fillText("COUNT: 2 ITEMS DETECTED", 25, 48);
      }

      // Rolling horizontal laser scanner line
      const lineY = (Math.sin(frame / 25) + 1) * (canvas.height / 2);
      ctx.fillStyle = "rgba(14, 165, 233, 0.08)";
      ctx.fillRect(0, lineY - 6, canvas.width, 12);
      ctx.strokeStyle = "rgba(14, 165, 233, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(canvas.width, lineY);
      ctx.stroke();

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [scanMode, fraudMode, scanCommodityVal, komoditas, petugas, user]);

  // Connect / Disconnect IoT Gateway
  const handleConnect = async () => {
    setScaleStatus("connecting");
    await new Promise((res) => setTimeout(res, 1200));
    await scaleService.connect();
    setScaleStatus("connected");
    playBeep(980, 0.15);
    toast.success("Timbangan Pintar IoT Terhubung via Web Bluetooth Gateway (V2.4)");
    setActivityLogs((prev) => [
      `[${new Date().toLocaleTimeString("id-ID")}] [IoT Scale] Timbangan digital terhubung (MAC ID: FE:98:C1:2A:90).`,
      ...prev,
    ]);
  };

  const handleDisconnect = () => {
    scaleService.disconnect();
    setScaleStatus("disconnected");
    playBeep(330, 0.25);
    toast.info("Timbangan IoT diputuskan secara aman.");
    setActivityLogs((prev) => [
      `[${new Date().toLocaleTimeString("id-ID")}] [IoT Scale] Timbangan terputus.`,
      ...prev,
    ]);
  };

  // Simulated Weight Stabilization Sequence (IoT feedback)
  const handleSimulateTimbang = async () => {
    if (scaleStatus !== "connected") {
      toast.error("Hubungkan timbangan IoT terlebih dahulu.");
      return;
    }
    
    playBeep(520, 0.08);
    setIsWeighing(true);
    setWeight(0);
    setTimestamp("");

    // Simulate scale counting up and stabilizing
    const targetWeight = Math.round(30 + Math.random() * 120);
    
    // Smooth weigh simulation
    for (let i = 0; i <= 10; i++) {
      await new Promise((res) => setTimeout(res, 80));
      const tempW = Math.round((targetWeight / 10) * i);
      setWeight(tempW);
      playBeep(400 + i * 40, 0.02);
    }

    setIsWeighing(false);
    setTimestamp(new Date().toISOString());

    // Auto-capture frame sequence
    setCameraFlash(true);
    playBeep(1200, 0.2); // Bright beep for camera capture
    setTimeout(() => setCameraFlash(false), 200);

    const comIcon = COMMODITIES.find((c) => c.id === komoditas)?.name ?? "Cabai Merah";
    toast.success(`IoT Berat Stabil: ${targetWeight} kg. Foto otomatis ditangkap & diunggah!`);

    // Attach local dummy photo corresponding to commodity visually scanned
    setPhoto(COMMODITY_IMAGES[scanCommodityVal] ?? "");

    // Check if input selection matches AI vision
    const isMismatch = scanCommodityVal !== komoditas;
    if (isMismatch) {
      playBeep(180, 0.5);
      toast.warning(`Sinyal AI Alert: Input Komoditas (${comIcon}) berbeda dengan pemindaian visual (${COMMODITIES.find((c) => c.id === scanCommodityVal)?.name})!`);
      setActivityLogs((prev) => [
        `[${new Date().toLocaleTimeString("id-ID")}] [AI Validation] ⚠ BAHAYA MISMATCH: Petugas menginput ${comIcon} tetapi kamera mendeteksi visual ${COMMODITIES.find((c) => c.id === scanCommodityVal)?.name}!`,
        ...prev,
      ]);
    } else {
      setActivityLogs((prev) => [
        `[${new Date().toLocaleTimeString("id-ID")}] [IoT Scale] Data timbang diterima: ${targetWeight} kg ${comIcon}. Validasi visual AI: Cocok (Verified).`,
        ...prev,
      ]);
    }
  };

  // Save weighing transaction to global database storage
  const handleSave = () => {
    if (!weight) {
      toast.error("Lakukan penimbangan terlebih dahulu.");
      return;
    }

    const currentMarket = MARKETS.find((m) => m.id === pasar)!;
    const isMismatch = scanCommodityVal !== komoditas;

    const record: WeighRecord = {
      id: `w-${Date.now()}`,
      tanggal: timestamp || new Date().toISOString(),
      komoditasId: komoditas,
      berat: weight,
      harga,
      pasarId: pasar,
      petugas: petugas || "Andi (BI)",
      foto: photo || COMMODITY_IMAGES[komoditas],
      lokasi: currentMarket.name,
      status_supply: "incoming",
      aiLabel: isMismatch 
        ? `Anomaly Detected: Input ${komoditas} vs visual Scan ${scanCommodityVal}` 
        : `Verified: ${komoditas} (${scanCommodityVal === "cabai" ? "Kualitas Baik" : "Premium"})`,
    };

    store.weighs.add(record);
    if (user) {
      logAudit(
        user,
        "TIMBANG_AI_SAVE",
        `${weight} kg ${komoditas} @ ${currentMarket.name} [Validated via Face & Vision]`
      );
    }

    setRows(store.weighs.get());
    playBeep(1000, 0.3);
    toast.success("Transaksi timbang digital tervalidasi AI berhasil disimpan permanen.");
    
    // Reset states
    setWeight(null);
    setPhoto("");
    setTimestamp("");
  };

  // Face Registration Submission
  const handleRegisterFace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName) {
      toast.error("Lengkapi nama petugas.");
      return;
    }

    const newOfficer: Officer = {
      id: `OFF-00${officers.length + 1}`,
      name: regName,
      role: regRole,
      pasarId: regPasar,
      photoUrl: regPhoto || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop",
      status: "Active"
    };

    setOfficers((prev) => [...prev, newOfficer]);
    playBeep(900, 0.2);
    toast.success(`Face ID petugas ${regName} berhasil terdaftar dan ditautkan ke BSSN (Tersertifikasi).`);
    setActivityLogs((prev) => [
      `[${new Date().toLocaleTimeString("id-ID")}] [Face Registration] Pendaftaran Wajah baru berhasil: ${regName} (ID: ${newOfficer.id}) ditautkan ke ${MARKETS.find((m) => m.id === regPasar)?.name}.`,
      ...prev,
    ]);

    // Set registered officer as current officer
    setPetugas(regName);
  };

  // Simulating image upload for face registration
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRegPhoto(reader.result as string);
      playBeep(700, 0.1);
      toast.success("Foto Face ID berhasil dimuat.");
    };
    reader.readAsDataURL(file);
  };

  // Visual status indicators
  const scaleColors: Record<ScaleStatus, string> = {
    disconnected: "bg-muted border-muted-foreground text-muted-foreground",
    connecting: "bg-warning/20 border-warning/40 text-warning animate-pulse",
    connected: "bg-supply/20 border-supply/40 text-supply",
    error: "bg-deficit/20 border-deficit/40 text-deficit",
  };

  const fraudColors = {
    normal: "bg-supply/10 border-supply/30 text-supply",
    "unknown-face": "bg-deficit/10 border-deficit/30 text-deficit animate-pulse",
    "no-officer": "bg-red-600 text-white animate-bounce",
  };

  return (
    <div className={`space-y-6 ${cameraFlash ? "animate-pulse" : ""}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Camera className="h-6 w-6 text-primary animate-pulse" /> Advanced AI Vision & IoT Scale Gateway
          </h2>
          <p className="text-sm text-muted-foreground">
            Otomatisasi pengenalan wajah petugas, klasifikasi komoditas, dan timbangan anti-fraud tersertifikasi Satu Data Indonesia.
          </p>
        </div>
        <Badge className={`border px-3 py-1 text-xs ${scaleColors[scaleStatus]}`}>
          {scaleStatus === "connected" ? "IoT SCALE: ONLINE" : scaleStatus === "connecting" ? "IoT SCALE: CONNECTING" : "IoT SCALE: OFFLINE"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN - CAMERA SIMULATOR PANEL */}
        <Card className="lg:col-span-7 border-sidebar-border bg-gradient-to-b from-sidebar to-sidebar/95 shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
          <CardHeader className="border-b border-sidebar-border/40 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
              <CardTitle className="text-sm uppercase tracking-wider text-sidebar-foreground">
                LIVE RETINA AI SYSTEM FEED
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Maximize2 className="h-3.5 w-3.5" /> 640x480 (FPS: 30)
            </div>
          </CardHeader>
          <CardContent className="p-4 flex flex-col items-center">
            {/* The Bounding Box Canvas Feed */}
            <div className="relative border-4 border-sidebar-primary/30 rounded-xl overflow-hidden shadow-inner bg-black w-full max-w-[640px] aspect-[4/3]">
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="w-full h-full object-cover"
              />
              {cameraFlash && (
                <div className="absolute inset-0 bg-white transition-opacity opacity-100" />
              )}
            </div>

            {/* QUICK TOGGLE CONTROLS FOR SIMULATION */}
            <div className="w-full mt-4 p-3 rounded-lg bg-black/40 border border-sidebar-border/30 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                {/* Scan Mode select */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">AI Scan Mode</span>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="xs"
                      variant={scanMode === "face" ? "default" : "outline"}
                      onClick={() => setScanMode("face")}
                      className="justify-start h-7 text-[10px]"
                    >
                      <User className="mr-1 h-3 w-3" /> Face Recognition
                    </Button>
                    <Button
                      size="xs"
                      variant={scanMode === "commodity" ? "default" : "outline"}
                      onClick={() => setScanMode("commodity")}
                      className="justify-start h-7 text-[10px]"
                    >
                      <Camera className="mr-1 h-3 w-3" /> Commodity Scan
                    </Button>
                    <Button
                      size="xs"
                      variant={scanMode === "multi" ? "default" : "outline"}
                      onClick={() => setScanMode("multi")}
                      className="justify-start h-7 text-[10px]"
                    >
                      <ScanLine className="mr-1 h-3 w-3" /> Multi Sack Counter
                    </Button>
                  </div>
                </div>

                {/* Fraud Simulator */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Anti Fraud Test</span>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="xs"
                      variant={fraudMode === "normal" ? "default" : "outline"}
                      onClick={() => setFraudMode("normal")}
                      className="justify-start h-7 text-[10px] border-supply/20 text-supply hover:bg-supply/10"
                    >
                      <ShieldCheck className="mr-1 h-3 w-3" /> Normal (Safe)
                    </Button>
                    <Button
                      size="xs"
                      variant={fraudMode === "unknown-face" ? "destructive" : "outline"}
                      onClick={() => setFraudMode("unknown-face")}
                      className="justify-start h-7 text-[10px]"
                    >
                      <ShieldAlert className="mr-1 h-3 w-3" /> Unknown Person
                    </Button>
                    <Button
                      size="xs"
                      variant={fraudMode === "no-officer" ? "destructive" : "outline"}
                      onClick={() => setFraudMode("no-officer")}
                      className="justify-start h-7 text-[10px]"
                    >
                      <Flame className="mr-1 h-3 w-3" /> Absent (18 mins)
                    </Button>
                  </div>
                </div>

                {/* Visual Commodity Simulator */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Camera Scan Match</span>
                  <select
                    className="w-full bg-sidebar/80 border border-sidebar-border rounded-md px-2 py-1 text-[11px] text-sidebar-foreground focus:outline-none"
                    value={scanCommodityVal}
                    onChange={(e) => {
                      setScanCommodityVal(e.target.value);
                      playBeep(650, 0.1);
                    }}
                  >
                    {COMMODITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Cocokkan ini dengan input timbang di panel kanan untuk mengetes kecocokan visual AI.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN - CONTROLS & MONITORING TABS */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Tabs defaultValue="timbang" className="w-full flex-1 flex flex-col">
            <TabsList className="grid grid-cols-3 h-11 border bg-muted/65 p-1">
              <TabsTrigger value="timbang" className="text-xs">
                <ScaleIcon className="mr-1.5 h-3.5 w-3.5" /> IoT Timbang
              </TabsTrigger>
              <TabsTrigger value="petugas" className="text-xs">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Registrasi
              </TabsTrigger>
              <TabsTrigger value="fraud" className="text-xs">
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Anti-Fraud
              </TabsTrigger>
            </TabsList>

            {/* TAB CONTENT: TIMBANGAN DIGITAL & IOT GATEWAY */}
            <TabsContent value="timbang" className="flex-1 space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Gateway Timbangan Digital IoT</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/40">
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">Gateway Bluetooth & USB</div>
                      <Badge className={`border text-xs px-2.5 mt-1 ${scaleColors[scaleStatus]}`}>
                        {scaleStatus.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      {scaleStatus === "connected" ? (
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="h-8">
                          Disconnect
                        </Button>
                      ) : (
                        <Button size="sm" onClick={handleConnect} disabled={scaleStatus === "connecting"} className="h-8">
                          <PlugZap className="mr-1.5 h-3.5 w-3.5" /> Connect IoT
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Input form */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Komoditas Yang Diinput</Label>
                      <Select
                        value={komoditas}
                        onValueChange={(v) => {
                          setKomoditas(v);
                          setHarga(COMMODITIES.find((c) => c.id === v)?.basePrice ?? 0);
                          playBeep(700, 0.08);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMODITIES.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.icon} {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Pasar Induk</Label>
                      <Select value={pasar} onValueChange={(v) => { setPasar(v); playBeep(700, 0.08); }}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MARKETS.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Berat Timbang Riil (kg)</Label>
                      <Input
                        value={isWeighing ? "Membaca IoT..." : weight !== null ? `${weight} kg` : ""}
                        readOnly
                        placeholder="Menunggu pembacaan IoT"
                        className="h-9 text-xs font-mono font-bold bg-muted"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Harga per kg (Rp)</Label>
                      <Input
                        type="number"
                        value={harga}
                        onChange={(e) => setHarga(parseInt(e.target.value || "0"))}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* AI Validation Banner */}
                  {weight !== null && (
                    <div className={`rounded-lg border p-3 text-xs flex items-start gap-2.5 ${
                      scanCommodityVal === komoditas 
                        ? "bg-supply/10 border-supply/30 text-supply" 
                        : "bg-deficit/10 border-deficit/30 text-deficit animate-pulse"
                    }`}>
                      {scanCommodityVal === komoditas ? (
                        <>
                          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">AI Visual Cocok (Verified):</span> Hasil tangkapan kamera mendeteksi komoditas <b>{COMMODITIES.find((c) => c.id === scanCommodityVal)?.name}</b> yang cocok dengan input data. Validitas 99.4%.
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">⚠ BAHAYA MISMATCH:</span> Hasil deteksi AI Kamera mendeteksi <b>{COMMODITIES.find((c) => c.id === scanCommodityVal)?.name}</b> tetapi Anda menginput <b>{COMMODITIES.find((c) => c.id === komoditas)?.name}</b>. Periksa kembali timbangan!
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleSimulateTimbang}
                      disabled={scaleStatus !== "connected" || isWeighing}
                      className="w-full text-xs h-9"
                    >
                      <ScaleIcon className="mr-1.5 h-3.5 w-3.5" />
                      {isWeighing ? "Membaca Timbangan..." : "Simulasi Timbang"}
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={weight === null || isWeighing}
                      className="w-full text-xs h-9"
                    >
                      Simpan Hasil Timbang
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB CONTENT: FACE REGISTRATION */}
            <TabsContent value="petugas" className="flex-1 space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Registrasi Wajah Petugas Baru</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleRegisterFace} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-xs">Nama Petugas</Label>
                        <Input
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="Nama lengkap"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role</Label>
                        <Select value={regRole} onValueChange={setRegRole}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Petugas Timbang" className="text-xs">Petugas Timbang</SelectItem>
                            <SelectItem value="BPS Surveyor" className="text-xs">BPS Surveyor</SelectItem>
                            <SelectItem value="BI Officer" className="text-xs">BI Officer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-xs">Alokasi Pasar</Label>
                        <Select value={regPasar} onValueChange={setRegPasar}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MARKETS.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="text-xs">
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Foto Wajah (Face Scan)</Label>
                        <Label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-muted/65 hover:bg-muted text-[11px] font-medium border-dashed">
                          <Upload className="h-3.5 w-3.5" /> Upload File
                          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </Label>
                      </div>
                    </div>

                    <Button type="submit" size="sm" className="w-full text-xs h-8">
                      Daftarkan Face ID Petugas
                    </Button>
                  </form>

                  {/* Registered Officers list */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      Daftar Database Petugas Aktif ({officers.length})
                    </span>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {officers.map((o) => (
                        <div key={o.id} className="flex items-center justify-between rounded-lg border p-2 bg-muted/30 text-xs">
                          <div className="flex items-center gap-2">
                            <img src={o.photoUrl} alt="face thumb" className="h-7 w-7 rounded-full object-cover border border-sidebar-border" />
                            <div>
                              <div className="font-bold text-foreground leading-tight">{o.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{o.id} · {o.role}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className={o.status === "Active" ? "border-supply/45 text-supply bg-supply/5 text-[9px]" : "border-amber-500/40 text-amber-500 bg-amber-500/5 text-[9px]"}>
                            {o.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB CONTENT: ANTI FRAUD COMMAND CENTER */}
            <TabsContent value="fraud" className="flex-1 space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Anti-Fraud & Live Presence Monitor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status Banner */}
                  <div className={`rounded-xl border p-4 text-xs shadow-inner transition ${fraudColors[fraudMode]}`}>
                    <div className="flex items-center gap-2 font-bold mb-1">
                      {fraudMode === "normal" ? (
                        <>
                          <ShieldCheck className="h-4.5 w-4.5 text-supply" />
                          <span>KEAMANAN AKTIF: PENGAWASAN AMAN</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="h-4.5 w-4.5 text-red-500 animate-bounce" />
                          <span className="uppercase">AWAS: ${
                            fraudMode === "no-officer" ? "Petugas Meninggalkan Pos!" : "Wajah Asing Terdeteksi!"
                          }</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {fraudMode === "normal" 
                        ? `Petugas ${petugas || "Andi (BI)"} terdeteksi di lokasi timbang secara real-time. Deteksi spoofing aktif.`
                        : fraudMode === "no-officer"
                          ? "Sinyal Fraud AI terdeteksi: Timbangan melakukan aktivitas timbang tetapi petugas tidak berada di lokasi pengawasan selama 18 menit."
                          : "Sinyal Fraud AI terdeteksi: Wajah yang tertangkap kamera timbangan tidak cocok dengan data Face ID petugas bersertifikat."
                      }
                    </p>
                  </div>

                  {/* Presence metrics */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border bg-muted/40 p-2 text-xs">
                      <span className="text-[10px] text-muted-foreground block">DURASI PRESENSI</span>
                      <span className="font-mono font-bold text-foreground">04h 32m</span>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2 text-xs">
                      <span className="text-[10px] text-muted-foreground block">FACE CONFIDENCE</span>
                      <span className="font-mono font-bold text-primary">
                        {fraudMode === "normal" ? "98.7%" : fraudMode === "unknown-face" ? "34.2%" : "0.0%"}
                      </span>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2 text-xs">
                      <span className="text-[10px] text-muted-foreground block">SINYAL ANOMALI</span>
                      <span className={`font-mono font-bold ${fraudMode === "normal" ? "text-supply" : "text-deficit"}`}>
                        {fraudMode === "normal" ? "0" : "1 ACTIVE"}
                      </span>
                    </div>
                  </div>

                  {/* Real-time Ticker */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 animate-pulse text-primary" /> Live AI Vision Log Ticker
                    </div>
                    <div className="rounded-lg border bg-black p-3 font-mono text-[10px] text-supply h-[110px] overflow-y-auto space-y-1.5 shadow-inner">
                      {activityLogs.map((log, idx) => (
                        <div key={idx} className="leading-tight break-all border-b border-sidebar-border/10 pb-1 last:border-0">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Penimbangan Validasi AI ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Komoditas</TableHead>
                <TableHead>Berat Timbang</TableHead>
                <TableHead>Harga per kg</TableHead>
                <TableHead>Pasar Induk</TableHead>
                <TableHead>Petugas</TableHead>
                <TableHead>Visual AI Validation (Audit)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 30).map((r) => {
                const c = COMMODITIES.find((x) => x.id === r.komoditasId);
                const isWarning = r.aiLabel?.includes("Anomaly") || r.aiLabel?.includes("mismatch");
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.tanggal).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {c?.icon} {c?.name}
                    </TableCell>
                    <TableCell className="font-bold">{r.berat} kg</TableCell>
                    <TableCell className="font-mono">Rp{r.harga.toLocaleString("id-ID")}</TableCell>
                    <TableCell className="text-xs">{r.lokasi}</TableCell>
                    <TableCell className="text-xs">{r.petugas}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isWarning ? "border-deficit/55 text-deficit bg-deficit/5 text-xs" : "border-supply/45 text-supply bg-supply/5 text-xs"}>
                        {r.aiLabel || "Verified"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
