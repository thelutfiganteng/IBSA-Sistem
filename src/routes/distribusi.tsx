import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { generateRecommendations } from "@/lib/ai";
import { COMMODITIES, REGIONS, MARKETS } from "@/lib/seed";
import { SUMSEL_GEOJSON } from "@/lib/sumselGeojson";
import { 
  ArrowRight, 
  Truck, 
  Play, 
  Pause, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  UserCheck, 
  Map as MapIcon, 
  AlertTriangle, 
  Gauge, 
  Compass, 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ShieldCheck, 
  Flame, 
  FileText,
  Layers,
  Sparkles,
  Info
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  Cell
} from "recharts";
import "leaflet/dist/leaflet.css";

// Standard coordinates for road logistics corridors in South Sumatra
function getLogisticsPath(fromId: string, toId: string): [number, number][] {
  const fromReg = REGIONS.find((r) => r.id === fromId);
  const toReg = REGIONS.find((r) => r.id === toId);
  if (!fromReg || !toReg) return [];

  const path: [number, number][] = [[fromReg.lat, fromReg.lng]];

  // Corridor mapping for realistic highway rendering
  if (fromId === "lubuklinggau" && toId === "palembang") {
    path.push([-3.5, 103.2]);      // Lahat corridor
    path.push([-3.65, 103.797]);   // Muara Enim
    path.push([-3.44, 104.236]);   // Prabumulih
  } else if (fromId === "oku-timur" && toId === "palembang") {
    path.push([-3.75, 104.55]);    // OKI/OI border
    path.push([-3.2, 104.75]);     // Indralaya
  } else if (fromId === "musi-banyuasin" && toId === "palembang") {
    path.push([-2.72, 104.38]);    // Betung corridor
  } else if (fromId === "oki" && toId === "palembang") {
    path.push([-3.25, 104.9]);     // Kayuagung corridor
  } else if (fromId === "muara-enim" && toId === "palembang") {
    path.push([-3.44, 104.236]);   // Prabumulih
  } else if (fromId === "lahat" && toId === "palembang") {
    path.push([-3.65, 103.797]);   // Muara Enim
    path.push([-3.44, 104.236]);   // Prabumulih
  } else {
    // Elegant bezier-like intermediate arc for other routes
    const midLat = (fromReg.lat + toReg.lat) / 2 + (fromReg.id.charCodeAt(0) % 3 === 0 ? 0.12 : -0.12);
    const midLng = (fromReg.lng + toReg.lng) / 2 + (toReg.id.charCodeAt(0) % 3 === 0 ? 0.12 : -0.12);
    path.push([midLat, midLng]);
  }

  path.push([toReg.lat, toReg.lng]);
  return path;
}

// Coordinate interpolation based on progress percentage along multi-segment paths
function interpolatePath(path: [number, number][], progress: number): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1 || progress <= 0) return path[0];
  if (progress >= 100) return path[path.length - 1];

  const f = progress / 100;
  const S = path.length - 1;
  const val = f * S;
  const i = Math.floor(val);
  const t = val - i;

  const start = path[i];
  const end = path[i + 1] || start;

  const lat = start[0] + (end[0] - start[0]) * t;
  const lng = start[1] + (end[1] - start[1]) * t;
  return [lat, lng];
}

interface DistributionOrder {
  id: string;
  commodityId: string;
  commodityName: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  quantityKg: number;
  status: "Pending" | "Approved" | "On Delivery" | "Delayed" | "Completed" | "Rejected";
  priority: "Low" | "Medium" | "High";
  eta: string;
  progress: number;
  logisticsPath: [number, number][];
  weather: string;
  traffic: string;
  createdAt: string;
  approvals: { bi: boolean; bps: boolean; dinas: boolean; pemprov: boolean };
  inflationImpact?: number;
  volatilityImpact?: number;
}

interface TelemetryLog {
  id: string;
  timestamp: string;
  event: string;
  payload: string;
}

export const Route = createFileRoute("/distribusi")({ component: DistribusiPage });

function DistribusiPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const mounted = useMounted();
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const shipmentMarkersRef = useRef<Map<string, any>>(new Map());

  // 1. Navigation state
  const [activeTab, setActiveTab] = useState<"command-center" | "simulation" | "orders">("command-center");

  // 2. Progressive simulation state
  const [isSimulating, setIsSimulating] = useState(true);
  const [simTick, setSimTick] = useState(0);

  // 3. Persistent Orders database
  const [orders, setOrders] = useState<DistributionOrder[]>([]);
  const [logs, setLogs] = useState<TelemetryLog[]>([]);

  // 4. BI Decision Sandbox states
  const [simComId, setSimComId] = useState("cabai");
  const [simSourceId, setSimSourceId] = useState("lubuklinggau");
  const [simTargetId, setSimTargetId] = useState("palembang");
  const [simVolume, setSimVolume] = useState(15); // in tonnes
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // 5. Smart Approval Workflows
  const [executingRec, setExecutingRec] = useState<any>(null);
  const [approvals, setApprovals] = useState({ bi: false, bps: false, dinas: false, pemprov: false });

  const name = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;
  const comName = (id: string) => COMMODITIES.find((c) => c.id === id)?.name ?? id;
  const comIcon = (id: string) => COMMODITIES.find((c) => c.id === id)?.icon ?? "📦";

  const safeFormatDate = (dateStr: any) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID");
  };

  const safeFormatTime = (dateStr: any) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const safeCleanName = (nameStr: any) => {
    if (!nameStr) return "";
    return String(nameStr).replace("Kab. ", "").replace("Kota ", "");
  };

  // A. Load or seed orders and logs
  useEffect(() => {
    if (!mounted) return;
    const cachedOrders = localStorage.getItem("sfs:distribution_orders");
    const cachedLogs = localStorage.getItem("sfs:distribution_logs");

    let loadedOrders: DistributionOrder[] = [];
    let needSeeding = true;

    if (cachedOrders) {
      try {
        const parsed = JSON.parse(cachedOrders);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedOrders = parsed.map((o: any) => {
            const sId = o.sourceId || "lubuklinggau";
            const tId = o.targetId || "palembang";
            const comId = o.commodityId || "cabai";
            const path = Array.isArray(o.logisticsPath) && o.logisticsPath.length > 0
              ? o.logisticsPath
              : getLogisticsPath(sId, tId);
            return {
              id: o.id || `DST-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
              commodityId: comId,
              commodityName: o.commodityName || comName(comId),
              sourceId: sId,
              sourceName: o.sourceName || name(sId),
              targetId: tId,
              targetName: o.targetName || name(tId),
              quantityKg: typeof o.quantityKg === 'number' ? o.quantityKg : 5000,
              status: o.status || "Pending",
              priority: o.priority || "Medium",
              eta: o.eta || "Menunggu Approval",
              progress: typeof o.progress === 'number' ? o.progress : 0,
              logisticsPath: path,
              weather: o.weather || "Cerah",
              traffic: o.traffic || "Lancar",
              createdAt: o.createdAt || new Date().toISOString(),
              approvals: o.approvals || { bi: false, bps: false, dinas: false, pemprov: false },
              inflationImpact: o.inflationImpact,
              volatilityImpact: o.volatilityImpact
            };
          });
          needSeeding = false;
        }
      } catch (err) {
        console.error("Failed to parse cached distribution orders:", err);
      }
    }

    if (needSeeding) {
      // Seed gorgeous initial prototype distribution orders
      const seedOrders: DistributionOrder[] = [
        {
          id: "DST-001",
          commodityId: "cabai",
          commodityName: "Cabai Merah",
          sourceId: "lubuklinggau",
          sourceName: "Kota Lubuklinggau",
          targetId: "palembang",
          targetName: "Kota Palembang",
          quantityKg: 8500,
          status: "On Delivery",
          priority: "High",
          eta: "2 jam 15 menit",
          progress: 45,
          logisticsPath: getLogisticsPath("lubuklinggau", "palembang"),
          weather: "Hujan Ringan",
          traffic: "Lancar",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          approvals: { bi: true, bps: true, dinas: true, pemprov: true },
          inflationImpact: 6.2,
          volatilityImpact: 14.5
        },
        {
          id: "DST-002",
          commodityId: "beras",
          commodityName: "Beras",
          sourceId: "oku-timur",
          sourceName: "Kab. OKU Timur",
          targetId: "oku-selatan",
          targetName: "Kab. OKU Selatan",
          quantityKg: 15000,
          status: "Completed",
          priority: "Medium",
          eta: "Tiba",
          progress: 100,
          logisticsPath: getLogisticsPath("oku-timur", "oku-selatan"),
          weather: "Cerah",
          traffic: "Lancar",
          createdAt: new Date(Date.now() - 18000000).toISOString(),
          approvals: { bi: true, bps: true, dinas: true, pemprov: true },
          inflationImpact: 5.8,
          volatilityImpact: 11.2
        },
        {
          id: "DST-003",
          commodityId: "bawang-merah",
          commodityName: "Bawang Merah",
          sourceId: "banyuasin",
          sourceName: "Kab. Banyuasin",
          targetId: "pali",
          targetName: "Kab. PALI",
          quantityKg: 2400,
          status: "Pending",
          priority: "Low",
          eta: "Menunggu Approval",
          progress: 0,
          logisticsPath: getLogisticsPath("banyuasin", "pali"),
          weather: "Cerah Berawan",
          traffic: "Padat",
          createdAt: new Date().toISOString(),
          approvals: { bi: false, bps: false, dinas: false, pemprov: false }
        }
      ];
      loadedOrders = seedOrders;
      localStorage.setItem("sfs:distribution_orders", JSON.stringify(seedOrders));
    } else {
      localStorage.setItem("sfs:distribution_orders", JSON.stringify(loadedOrders));
    }
    setOrders(loadedOrders);

    if (cachedLogs) {
      setLogs(JSON.parse(cachedLogs));
    } else {
      const seedLogs: TelemetryLog[] = [
        { id: "log-1", timestamp: new Date(Date.now() - 7200000).toLocaleTimeString("id-ID"), event: "TELEMETRY", payload: "DST-002: Muatan 15 ton Beras selesai dimuat di OKU Timur." },
        { id: "log-2", timestamp: new Date(Date.now() - 3600000).toLocaleTimeString("id-ID"), event: "TELEMETRY", payload: "DST-001: Armada logistik melewati pos Lahat dengan kecepatan 64 km/jam." },
        { id: "log-3", timestamp: new Date().toLocaleTimeString("id-ID"), event: "TELEMETRY", payload: "DST-002: Armada logistik tiba di OKU Selatan. Distribusi Pangan Sukses!" }
      ];
      setLogs(seedLogs);
      localStorage.setItem("sfs:distribution_logs", JSON.stringify(seedLogs));
    }
  }, [mounted]);

  // B. K-Means real-time metrics computations
  const kmeansData = useMemo(() => {
    if (!mounted) return null;
    const base = computeRegionMetrics(store.weighs.get());
    const m = applyClusters(base);
    const recs = generateRecommendations(m);
    return { metrics: m, recs };
  }, [mounted, simTick]);

  // C. Progressive Interval Simulation Loop
  useEffect(() => {
    if (!isSimulating || orders.length === 0) return;

    const interval = setInterval(() => {
      let updated = false;
      const nextOrders = orders.map((o) => {
        if (o.status === "On Delivery") {
          updated = true;
          const delta = Math.round(4 + Math.random() * 5);
          const nextProgress = Math.min(100, o.progress + delta);
          const isFinished = nextProgress === 100;

          // Generate dynamic mock telemetry events
          if (nextProgress % 15 === 0 || isFinished) {
            const nowTime = new Date().toLocaleTimeString("id-ID");
            let eventMsg = "";

            if (isFinished) {
              const infPct = o.inflationImpact || 5.5;
              eventMsg = `${o.id}: Pengiriman selesai! Penyaluran ${o.quantityKg.toLocaleString()} kg ${o.commodityName} berhasil menekan inflasi ${o.targetName} sebesar ${infPct}%.`;
              
              // Seed custom weighing record in local storage representing target market supply absorption!
              const currentWeighs = store.weighs.get();
              const targetMarket = MARKETS.find((m) => m.region === o.targetId);
              if (targetMarket) {
                store.weighs.add({
                  id: `dist-absorbed-${o.id}-${Date.now()}`,
                  tanggal: new Date().toISOString(),
                  komoditasId: o.commodityId,
                  berat: o.quantityKg,
                  harga: Math.round(COMMODITIES.find((c) => c.id === o.commodityId)!.basePrice * 0.95),
                  pasarId: targetMarket.id,
                  petugas: "Armada AI",
                  foto: "",
                  lokasi: targetMarket.name,
                  status_supply: "distributed",
                  aiLabel: o.commodityName
                });
              }
            } else {
              const checkPoints = ["Betung", "Lahat", "Prabumulih", "Baturaja", "Indralaya"];
              const checkpoint = checkPoints[Math.floor(Math.random() * checkPoints.length)];
              eventMsg = `${o.id}: Armada logistik melintas di pos ${checkpoint}. Kecepatan ${Math.round(58 + Math.random() * 12)} km/jam. Cuaca: ${o.weather}.`;
            }

            setLogs((prev) => {
              const nextLogs = [{ id: Math.random().toString(), timestamp: nowTime, event: "TELEMETRY", payload: eventMsg }, ...prev.slice(0, 49)];
              localStorage.setItem("sfs:distribution_logs", JSON.stringify(nextLogs));
              return nextLogs;
            });
          }

          return {
            ...o,
            progress: nextProgress,
            status: isFinished ? "Completed" : o.status,
            eta: isFinished ? "Tiba" : `${Math.round((100 - nextProgress) * 1.5)} menit`
          };
        }
        return o;
      });

      if (updated) {
        setOrders(nextOrders);
        localStorage.setItem("sfs:distribution_orders", JSON.stringify(nextOrders));
        setSimTick((t) => t + 1); // trigger re-renders of map and graphs
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isSimulating, orders]);

  // D. Map rendering & real-time shipment crawlers
  useEffect(() => {
    let active = true;
    let layersToCleanup: any[] = [];
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      if (typeof window === "undefined" || !mapContainerRef.current || activeTab !== "command-center") return;
      const L = (await import("leaflet")).default;
      
      // Inject Animated Polyline CSS Styles
      if (!document.getElementById("leaflet-animated-styles")) {
        const style = document.createElement("style");
        style.id = "leaflet-animated-styles";
        style.innerHTML = `
          @keyframes leaflet-flow-anim {
            to {
              stroke-dashoffset: -40;
            }
          }
          .leaflet-animated-flow {
            stroke-dasharray: 10, 15;
            animation: leaflet-flow-anim 1.5s linear infinite !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      if (!active || !mapContainerRef.current) return;

      // 1. Clear previous map instance
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      shipmentMarkersRef.current.clear();

      // 2. Initialize Map centering on South Sumatra
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([-3.3, 104.0], 7.3);

      mapRef.current = map;

      // 3. ResizeObserver integration for 100% responsive fluid sizes
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);

      // 4. CartoDB Premium Dark Map Tiles
      const tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
      L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map);

      // 5. Draw South Sumatra Regency Boundaries (with our enclave hole Palembang cutout!)
      const geoJsonBoundary = L.geoJSON(SUMSEL_GEOJSON as any, {
        style: (feature: any) => {
          // Identify if region is surplus, defisit, or stabil to give a beautiful background glow
          const rId = feature.properties.id;
          const kRegion = kmeansData?.metrics?.find((m) => m.regionId === rId);
          const cluster = kRegion?.cluster ?? "Stabil";

          let color = "#1e293b"; // slate-800
          if (cluster.startsWith("Surplus")) color = "#15803d"; // emerald
          else if (cluster.startsWith("Defisit")) color = "#991b1b"; // red

          return {
            fillColor: color,
            fillOpacity: 0.15,
            color: "#475569", // slate-600 border
            weight: 1.2,
            opacity: 0.7
          };
        }
      }).addTo(map);
      layersToCleanup.push(geoJsonBoundary);

      // 6. Draw active distribution routes and crawlers
      orders.forEach((o) => {
        if (o.status === "On Delivery" || o.status === "Completed" || o.status === "Approved") {
          const pathCoords = o.logisticsPath;
          if (pathCoords.length < 2) return;

          // Color route line depending on status
          let routeColor = "#10b981"; // green (normal)
          if (o.traffic === "Macet" || o.weather === "Badai") {
            routeColor = "#ef4444"; // red (delayed/bottleneck)
          } else if (o.traffic === "Padat" || o.weather === "Hujan Lebat") {
            routeColor = "#f59e0b"; // yellow (warning)
          }

          // Animated dashed route polyline
          const polyline = L.polyline(pathCoords, {
            color: routeColor,
            weight: 3.5,
            dashArray: "8, 12",
            className: o.status === "On Delivery" ? "leaflet-animated-flow" : "", // animates flow via CSS
            opacity: 0.8
          }).addTo(map);
          layersToCleanup.push(polyline);

          polyline.bindPopup(`
            <div style="font-family:system-ui,sans-serif; font-size:12px; min-width:160px;">
              <b style="color:#0ea5e9; font-size:13px;">${o.id || ""} - ${o.commodityName || ""}</b><br/>
              Volume: <b>${((o.quantityKg || 0) / 1000).toFixed(1)} Ton</b><br/>
              Rute: <i>${safeCleanName(o.sourceName)} &rarr; ${safeCleanName(o.targetName)}</i><br/>
              Status: <span style="font-weight:bold; color:${routeColor};">${o.status || ""}</span>
            </div>
          `);

          // 7. Render dynamic moving shipment crawlers
          if (o.status === "On Delivery") {
            const currentCoord = interpolatePath(pathCoords, o.progress);
            const crawlerIcon = L.divIcon({
              className: "",
              html: `
                <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                  <span class="absolute inline-flex h-7 w-7 rounded-full bg-cyan-400 opacity-60 animate-ping"></span>
                  <div style="background:#0284c7; color:white; font-size:14px; width:26px; height:26px; border-radius:50%; border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 6px rgba(0,0,0,0.4); font-weight:bold;">🚚</div>
                  <div style="position:absolute; top:28px; background:rgba(15,23,42,0.85); color:#38bdf8; font-size:8px; font-family:monospace; font-weight:bold; padding:1px 4px; border-radius:3px; border:1px solid #0284c7; white-space:nowrap;">
                    ${o.id} (${o.progress}%)
                  </div>
                </div>
              `,
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            });

            const crawlerMarker = L.marker(currentCoord, { icon: crawlerIcon }).addTo(map);
            shipmentMarkersRef.current.set(o.id, crawlerMarker);
            layersToCleanup.push(crawlerMarker);
          }
        }
      });
    })();

    return () => {
      active = false;
      layersToCleanup.forEach((l) => l.remove());
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [orders, activeTab, kmeansData]);

  // E. BI Economic Simulation Core Engine
  const runEconomicSimulation = () => {
    const com = COMMODITIES.find((c) => c.id === simComId)!;
    const sourceName = name(simSourceId);
    const destinationName = name(simTargetId);
    
    // Simulate real-time BI impact algorithms
    const vol = simVolume;
    const volatilityDrop = Math.min(32, Math.round(vol * 0.9 + 4)); // Volatility drop e.g. 14%
    const inflationDrop = Math.min(15, Math.round(vol * 0.4 + 1));  // Inflation Drop e.g. 6%
    const gapCovered = Math.min(100, Math.round((vol * 1000) / 12500 * 100)); // Defisit coverage

    const currentPrice = com.basePrice * 1.28; // Defisit price inflation
    const predictedPrice = Math.max(com.basePrice * 0.98, currentPrice - (vol * 140)); // Price corrected downwards
    const stabilityIndex = Math.min(100, Math.round(55 + (vol * 2.2))); // Stability index e.g. 88%

    setSimulationResult({
      commodityName: com.name,
      commodityIcon: com.icon,
      sourceName,
      destinationName,
      vol,
      volatilityDrop,
      inflationDrop,
      gapCovered,
      currentPrice,
      predictedPrice,
      stabilityIndex,
      insight: `Distribusi ${vol} Ton ${com.name} dari ${sourceName} ke ${destinationName} diprediksi mengamankan stok pangan sasaran, menekan defisit regional sebesar ${gapCovered}%, serta menurunkan volatilitas harga di pasar strategis sebesar ${volatilityDrop}%.`
    });

    // Write audit log inside persistent storage
    store.audit.add({
      id: `sim-audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: "Bank Indonesia Simulator",
      role: "bi",
      action: "Simulasi Dampak Ekonomi",
      detail: `Model BI: ${vol} Ton ${com.name} ${sourceName} -> ${destinationName}.`
    });
  };

  // F. Execute & Approval Workflows
  const startApprovalWorkflow = (rec: any) => {
    setExecutingRec(rec);
    setApprovals({ bi: false, bps: false, dinas: false, pemprov: false });
    setActiveTab("command-center");

    // Scroll to approval panel
    document.getElementById("governance-approval-panel")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleApproval = (role: "bi" | "bps" | "dinas" | "pemprov") => {
    setApprovals((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  const createDistributionOrder = () => {
    if (!executingRec) return;

    const newOrderId = `DST-00${orders.length + 1}`;
    const com = COMMODITIES.find((c) => c.id === executingRec.komoditasId)!;
    const sourceReg = REGIONS.find((r) => r.id === executingRec.fromRegionId)!;
    const targetReg = REGIONS.find((r) => r.id === executingRec.toRegionId)!;

    const newOrder: DistributionOrder = {
      id: newOrderId,
      commodityId: com.id,
      commodityName: com.name,
      sourceId: sourceReg.id,
      sourceName: sourceReg.name,
      targetId: targetReg.id,
      targetName: targetReg.name,
      quantityKg: executingRec.amountKg,
      status: "Approved", // Approved by our smart governance panel!
      priority: executingRec.priority === "high" ? "High" : executingRec.priority === "medium" ? "Medium" : "Low",
      eta: "Menunggu Driver",
      progress: 0,
      logisticsPath: getLogisticsPath(sourceReg.id, targetReg.id),
      weather: "Cerah",
      traffic: "Lancar",
      createdAt: new Date().toISOString(),
      approvals: { ...approvals },
      inflationImpact: Math.min(10, Number((4 + Math.random() * 4).toFixed(1))),
      volatilityImpact: Math.min(25, Number((10 + Math.random() * 12).toFixed(1)))
    };

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    localStorage.setItem("sfs:distribution_orders", JSON.stringify(nextOrders));

    // Telemetry log
    const nowTime = new Date().toLocaleTimeString("id-ID");
    const nextLogs = [
      { id: Math.random().toString(), timestamp: nowTime, event: "SYSTEM", payload: `${newOrderId}: Rekomendasi AI berhasil dieksekusi. Order distribusi dibuat dengan otorisasi TPID.` },
      ...logs
    ];
    setLogs(nextLogs);
    localStorage.setItem("sfs:distribution_logs", JSON.stringify(nextLogs));

    // Add Audit Log
    store.audit.add({
      id: `order-create-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: "TPID Operator",
      role: "dinas",
      action: "Membuat Order Distribusi",
      detail: `${newOrderId} (${com.name} - ${(executingRec.amountKg / 1000).toFixed(1)} Ton) ${sourceReg.name} -> ${targetReg.name}.`
    });

    setExecutingRec(null);
  };

  const startShipment = (orderId: string) => {
    const nextOrders = orders.map((o) => {
      if (o.id === orderId) {
        return { 
          ...o, 
          status: "On Delivery" as const, 
          eta: "Mengkalkulasi rute...",
          weather: ["Cerah", "Hujan Ringan", "Cerah Berawan"][Math.floor(Math.random() * 3)],
          traffic: ["Lancar", "Padat Merayap", "Lancar"][Math.floor(Math.random() * 3)]
        };
      }
      return o;
    });
    setOrders(nextOrders);
    localStorage.setItem("sfs:distribution_orders", JSON.stringify(nextOrders));

    const nowTime = new Date().toLocaleTimeString("id-ID");
    const nextLogs = [
      { id: Math.random().toString(), timestamp: nowTime, event: "SYSTEM", payload: `${orderId}: Driver terverifikasi, IoT GPS Node Active, armada logistik berangkat dari gudang asal.` },
      ...logs
    ];
    setLogs(nextLogs);
    localStorage.setItem("sfs:distribution_logs", JSON.stringify(nextLogs));
  };

  // G. Calculate global KPI stats dynamically
  const kpis = useMemo(() => {
    const active = orders.filter((o) => o.status === "On Delivery" || o.status === "Approved").length;
    const foodMoved = orders
      .filter((o) => o.status === "Completed" || o.status === "On Delivery")
      .reduce((sum, o) => sum + o.quantityKg, 0) / 1000; // in Tonnes
    const completed = orders.filter((o) => o.status === "Completed");
    const avgInf = completed.length
      ? Number((completed.reduce((sum, o) => sum + (o.inflationImpact || 0), 0) / completed.length).toFixed(1))
      : 5.4;
    const efficiency = 95 - (orders.filter((o) => o.status === "Delayed").length * 5);
    return { active, foodMoved, avgInf, efficiency };
  }, [orders]);

  return (
    <div className="space-y-6">
      
      {/* 1. Header & Command Center KPIs */}
      <div className="relative rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-950 to-emerald-950 p-6 text-white shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/20 border border-primary/45 text-primary shadow-inner">
              <Truck className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">AI Food Logistics & Distribution Command Center</h2>
              <p className="text-xs text-slate-400 font-medium">
                Pusat Kendali Pengendalian Inflasi Daerah (TPID) & Sistem Eksekusi Rantai Pasok Pangan Sumatera Selatan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSimulating(!isSimulating)}
              className={`font-semibold border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-white ${isSimulating ? 'border-emerald-500/30' : ''}`}
            >
              {isSimulating ? <Pause className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> : <Play className="mr-1.5 h-3.5 w-3.5 text-sky-400" />}
              {isSimulating ? "Pause Simulator" : "Run Simulator"}
            </Button>

            <Badge className="bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 font-bold px-3 py-1 animate-pulse flex gap-1 items-center text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> SYSTEM REALTIME ACTIVE
            </Badge>
          </div>
        </div>

        {/* Dynamic Command Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-sky-400" /> Distribusi Aktif
            </div>
            <div className="text-2xl font-black text-white tabular-nums flex items-baseline gap-1">
              {kpis.active} <span className="text-[10px] font-medium text-slate-400">jalur</span>
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-medium">Dalam proses mobilisasi hulu-hilir</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-emerald-400" /> Pangan Dipindahkan
            </div>
            <div className="text-2xl font-black text-white tabular-nums flex items-baseline gap-1">
              {kpis.foodMoved.toFixed(1)} <span className="text-[10px] font-medium text-slate-400">Ton</span>
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-medium">Cadangan pangan tersalurkan</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber-500" /> Reduksi Inflasi AI
            </div>
            <div className="text-2xl font-black text-emerald-400 tabular-nums flex items-baseline gap-1">
              -{kpis.avgInf}%
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-medium">Rata-rata stabilitas harga tercapai</div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-primary" /> Efisiensi Logistik
            </div>
            <div className="text-2xl font-black text-white tabular-nums flex items-baseline gap-1">
              {kpis.efficiency}%
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-medium">AI Optimal Route & Weather Index</div>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-border p-1 bg-muted/30 rounded-xl max-w-lg gap-1">
        <button
          onClick={() => setActiveTab("command-center")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "command-center" ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Compass className="h-3.5 w-3.5 text-primary" /> Command Center Live
        </button>
        <button
          onClick={() => setActiveTab("simulation")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "simulation" ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Brain className="h-3.5 w-3.5 text-emerald-500 animate-pulse" /> BI Economic Simulator
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "orders" ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <FileText className="h-3.5 w-3.5 text-amber-500" /> Database Distribusi
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: COMMAND CENTER LIVE VIEW                              */}
      {/* ============================================================ */}
      {activeTab === "command-center" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          
          {/* Left Columns (3 span): Recommendations and Controls */}
          <div className="xl:col-span-2.5 xl:col-start-1 xl:col-end-4 space-y-6">
            
            {/* AI Recommendations queue */}
            <Card className="border border-border/80 shadow-md">
              <CardHeader className="bg-muted/10 border-b py-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Brain className="h-4.5 w-4.5 text-emerald-500 animate-bounce" />
                  AI Decision Support & Priority Queue (Rekomendasi Surplus-Defisit)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {kmeansData && kmeansData.recs.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-6">
                    Kondisi supply Sumsel termonitor seimbang. Tidak ada antrean mobilisasi pasokan darurat.
                  </p>
                )}
                {kmeansData && kmeansData.recs.map((r: any) => {
                  const isAlreadyExecuted = orders.some((o) => o.sourceId === r.fromRegionId && o.targetId === r.toRegionId && o.commodityId === r.komoditasId && o.status !== "Completed");
                  return (
                    <div
                      key={r.id}
                      className="grid gap-4 rounded-xl border p-4 bg-muted/10 border-border/70 md:grid-cols-[1.5fr_auto_1.5fr_auto_1fr_auto]"
                    >
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Asal (Surplus)</div>
                        <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 truncate">{name(r.fromRegionId)}</div>
                        <div className="text-[10px] text-muted-foreground">K-Means: Surplus Tinggi</div>
                      </div>

                      <div className="flex items-center justify-center">
                        <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Tujuan (Defisit)</div>
                        <div className="text-base font-bold text-red-600 dark:text-red-400 truncate">{name(r.toRegionId)}</div>
                        <div className="text-[10px] text-muted-foreground">K-Means: Defisit Kritis</div>
                      </div>

                      <div className="border-t md:border-t-0 md:border-l border-border/80 my-1 md:my-0" />

                      <div className="flex flex-col justify-center items-center md:items-start">
                        <div className="text-lg font-black text-foreground flex items-center gap-1.5">
                          {comIcon(r.komoditasId)} {r.amountKg.toLocaleString()} kg
                        </div>
                        <div className="text-[10px] text-muted-foreground font-semibold">Komoditas: {comName(r.komoditasId)}</div>
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <Badge className={`font-extrabold uppercase text-[9px] ${
                          r.priority === "high" ? "bg-red-500 text-white animate-pulse" : r.priority === "medium" ? "bg-amber-500 text-white" : "bg-slate-500 text-white"
                        }`}>
                          {r.priority} PRIORITY
                        </Badge>
                        
                        {isAlreadyExecuted ? (
                          <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5 font-extrabold">Active</Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-primary/95 hover:bg-primary text-white text-xs font-bold shrink-0"
                            onClick={() => startApprovalWorkflow(r)}
                          >
                            Execute Recommendation
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Smart Approval Governance Panel */}
            {executingRec && (
              <Card id="governance-approval-panel" className="border-2 border-primary/30 shadow-lg bg-primary/5 transition-all">
                <CardHeader className="py-4 border-b border-primary/20">
                  <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" /> 
                    Smart Governance Approval Panel (Otorisasi Lintas Instansi)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Sesuai kaidah ketahanan pangan daerah, pergerakan pasokan strategis memerlukan otorisasi multi-sektoral. Nyalakan persetujuan dari masing-masing pemangku kepentingan untuk mengubah rekomendasi AI menjadi perintah logistik nyata:
                  </div>

                  {/* Multi-role Approval Badges */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div 
                      onClick={() => toggleApproval("bi")}
                      className={`cursor-pointer rounded-xl border p-3 flex flex-col items-center justify-center text-center transition-all ${
                        approvals.bi ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' : 'bg-background hover:bg-muted border-border/80'
                      }`}
                    >
                      <span className="text-lg mb-1">🏦</span>
                      <div className="font-extrabold text-[11px] uppercase tracking-wider">Bank Indonesia</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{approvals.bi ? "✅ Approved" : "❌ Pending"}</div>
                    </div>

                    <div 
                      onClick={() => toggleApproval("bps")}
                      className={`cursor-pointer rounded-xl border p-3 flex flex-col items-center justify-center text-center transition-all ${
                        approvals.bps ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' : 'bg-background hover:bg-muted border-border/80'
                      }`}
                    >
                      <span className="text-lg mb-1">📊</span>
                      <div className="font-extrabold text-[11px] uppercase tracking-wider">BPS Sumsel</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{approvals.bps ? "✅ Approved" : "❌ Pending"}</div>
                    </div>

                    <div 
                      onClick={() => toggleApproval("dinas")}
                      className={`cursor-pointer rounded-xl border p-3 flex flex-col items-center justify-center text-center transition-all ${
                        approvals.dinas ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' : 'bg-background hover:bg-muted border-border/80'
                      }`}
                    >
                      <span className="text-lg mb-1">🌾</span>
                      <div className="font-extrabold text-[11px] uppercase tracking-wider">Dinas Pangan</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{approvals.dinas ? "✅ Approved" : "❌ Pending"}</div>
                    </div>

                    <div 
                      onClick={() => toggleApproval("pemprov")}
                      className={`cursor-pointer rounded-xl border p-3 flex flex-col items-center justify-center text-center transition-all ${
                        approvals.pemprov ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' : 'bg-background hover:bg-muted border-border/80'
                      }`}
                    >
                      <span className="text-lg mb-1">🏛️</span>
                      <div className="font-extrabold text-[11px] uppercase tracking-wider">Pemprov Sumsel</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{approvals.pemprov ? "✅ Approved" : "❌ Pending"}</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExecutingRec(null)}
                      className="text-xs font-semibold"
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      onClick={createDistributionOrder}
                      disabled={!approvals.bi || !approvals.bps || !approvals.dinas || !approvals.pemprov}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md"
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-white" />
                      Approve & Generate Distribution Order
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Smart Distribution Orders Dashboard */}
            <Card className="border border-border/80 shadow-md">
              <CardHeader className="bg-muted/10 border-b py-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Truck className="h-4.5 w-4.5 text-primary" /> 
                  Active Distribution Orders Database (Armada & Realtime Progress)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead className="py-3 px-4 font-bold text-xs uppercase text-slate-400">Order ID</TableHead>
                      <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Komoditas</TableHead>
                      <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Asal &rarr; Tujuan</TableHead>
                      <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400 text-right">Volume</TableHead>
                      <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Prioritas</TableHead>
                      <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Status & Live Progress</TableHead>
                      <TableHead className="py-3 px-4 font-bold text-xs uppercase text-slate-400">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.filter((o) => o.status !== "Completed").length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground italic text-xs">
                          Tidak ada pengiriman logistik pangan aktif saat ini.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders
                        .filter((o) => o.status !== "Completed")
                        .map((o) => {
                          let statusColor = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                          let progressColor = "bg-slate-500";

                          if (o.status === "Approved") {
                            statusColor = "bg-sky-500/10 text-sky-500 border-sky-500/20";
                            progressColor = "bg-sky-500";
                          } else if (o.status === "On Delivery") {
                            statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                            progressColor = "bg-emerald-500";
                          } else if (o.status === "Delayed") {
                            statusColor = "bg-red-500/10 text-red-500 border-red-500/20";
                            progressColor = "bg-red-500";
                          }

                          return (
                            <TableRow key={o.id} className="hover:bg-muted/10 transition-colors">
                              <td className="py-3.5 px-4 font-bold font-mono text-xs text-foreground/90">{o.id}</td>
                              <td className="py-3.5 px-3 font-medium text-xs">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-lg">{comIcon(o.commodityId)}</span>
                                  {o.commodityName}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-xs">
                                <div className="font-semibold text-foreground/90 leading-tight">
                                  {safeCleanName(o.sourceName)}
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  &rarr; {safeCleanName(o.targetName)}
                                </div>
                              </td>
                              <td className="py-3.5 px-3 text-right font-black tabular-nums text-xs">
                                {(o.quantityKg / 1000).toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground">Ton</span>
                              </td>
                              <td className="py-3.5 px-3">
                                <Badge className={`text-[9px] font-extrabold ${
                                  o.priority === "High" ? "bg-red-500" : o.priority === "Medium" ? "bg-amber-500" : "bg-slate-500"
                                }`}>
                                  {o.priority}
                                </Badge>
                              </td>
                              <td className="py-3.5 px-3 min-w-[140px] text-xs">
                                <div className="flex items-center justify-between mb-1.5">
                                  <Badge variant="outline" className={`text-[9px] font-extrabold capitalize ${statusColor}`}>
                                    {o.status}
                                  </Badge>
                                  <span className="font-mono text-[10px] font-bold text-slate-500">{o.progress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted/65 rounded-full overflow-hidden">
                                  <div className={`h-full ${progressColor}`} style={{ width: `${o.progress}%` }} />
                                </div>
                                <div className="text-[9px] text-muted-foreground mt-1 flex justify-between font-semibold">
                                  <span>ETA: {o.eta}</span>
                                  <span>Jalan: {o.traffic}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-xs">
                                {o.status === "Approved" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => startShipment(o.id)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] px-2 h-7"
                                  >
                                    <Play className="mr-1 h-3 w-3" /> Start Shipment
                                  </Button>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 italic flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
                                    Tracking Live
                                  </span>
                                )}
                              </td>
                            </TableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Right Columns (1 span): Live Tracking Radar Map & Telemetry Logs */}
          <div className="xl:col-span-1.5 xl:col-start-4 xl:col-end-5 space-y-6">
            
            {/* Live Distribution Radar */}
            <Card className="border border-border/80 shadow-lg overflow-hidden relative">
              <CardHeader className="bg-muted/15 border-b py-3 px-4">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <MapIcon className="h-4 w-4 text-primary animate-pulse" />
                  Live Logistics Tracking Radar Map
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 relative">
                <div 
                  ref={mapContainerRef} 
                  className="h-[360px] w-full bg-slate-950" 
                />
                
                {/* Overlay Tip */}
                <div className="absolute top-3 left-3 z-[1000] bg-slate-900/90 border border-slate-700/80 shadow-md rounded-lg px-2.5 py-1 text-[10px] flex items-center gap-1.5 font-bold text-slate-200 backdrop-blur-sm">
                  <span className="h-2 w-2 bg-sky-400 rounded-full animate-ping" />
                  <span>Real-time GPS Simulator</span>
                </div>
              </CardContent>
            </Card>

            {/* Simulated Live Telemetry Log Feed */}
            <Card className="border border-border/80 shadow-md bg-slate-950 text-slate-100 font-mono">
              <CardHeader className="py-3 px-4 border-b border-slate-800 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Logistics Telemetry Feed Terminal
                </CardTitle>
                <Badge variant="outline" className="text-slate-400 border-slate-800 text-[8px] font-mono leading-none">
                  Live feed
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-32 overflow-y-auto space-y-1 text-[10px] select-text">
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic text-center py-8">
                      Handshaking IoT logistics server...
                    </div>
                  ) : (
                    logs.map((l) => (
                      <div key={l.id} className="flex items-start gap-1.5 border-b border-slate-900/40 pb-1 last:border-0 font-mono leading-relaxed text-slate-300">
                        <span className="text-slate-500 font-semibold shrink-0">[{l.timestamp}]</span>
                        <span className={`shrink-0 font-bold ${
                          l.payload.includes("selesai") || l.payload.includes("Sukses")
                            ? "text-emerald-400"
                            : l.payload.includes("melintas")
                            ? "text-cyan-400"
                            : "text-amber-400"
                        }`}>
                          {l.event}:
                        </span>
                        <span className="flex-1 truncate font-medium">
                          {l.payload}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Distribution Impact Card */}
            {orders.some((o) => o.status === "Completed") && (
              <Card className="border border-emerald-500/20 bg-emerald-500/5 shadow-inner">
                <CardHeader className="py-3 px-4 border-b border-emerald-500/10">
                  <CardTitle className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
                    AI Distribution Impact Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2 text-xs leading-relaxed text-foreground/90">
                  <p className="font-semibold">
                    Stabilitas harga bahan pokok tercapai di beberapa wilayah target. AI menghitung dampak ekonomi kumulatif:
                  </p>
                  <div className="space-y-1.5 pt-1">
                    {orders
                      .filter((o) => o.status === "Completed")
                      .slice(0, 2)
                      .map((o) => (
                        <div key={o.id} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 flex items-start gap-2">
                          <span className="text-base shrink-0">🟢</span>
                          <div>
                            <div className="font-bold text-emerald-600 dark:text-emerald-400">{o.id}: {o.commodityName}</div>
                            <div className="font-medium">
                              Volume {(o.quantityKg / 1000).toFixed(1)} Ton berhasil dipindahkan ke {o.targetName}. Volatilitas harga diprediksi turun sebesar <span className="font-extrabold text-emerald-500">{o.volatilityImpact}%</span> dan mereduksi inflasi pangan lokal <span className="font-extrabold text-emerald-500">{o.inflationImpact}%</span>.
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Future Integration Ready Alert */}
            <Card className="border border-border/80 shadow bg-slate-900/40 p-4 space-y-2">
              <div className="flex gap-2 text-xs">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="text-slate-400 font-medium leading-relaxed">
                  <span className="font-bold text-slate-300">Future-Ready Architecture:</span> Sistem prototype ini dirancang untuk siap dihubungkan langsung dengan API armada logistik TPID, GPS pelacakan kendaraan riil, sensor suhu ruang muatan IoT, kartu RFID karung gudang, dan aplikasi driver kurir pengantar.
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: AI ECONOMIC SIMULATION ENGINE                         */}
      {/* ============================================================ */}
      {activeTab === "simulation" && (
        <Card className="border border-border/80 shadow-lg">
          <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Brain className="h-5 w-5 text-emerald-500" />
                AI Economic Simulation Engine (BI Sandbox Modeling)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Simulasikan dampak alokasi supply pangan terhadap volatilitas harga, risiko inflasi, dan stabilitas pasar strategis.
              </p>
            </div>
            <Badge className="bg-primary/95 text-white shadow font-extrabold text-[10px] tracking-wide">
              📊 BI SPECIALIST
            </Badge>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              
              {/* Simulation Sandbox Form */}
              <div className="space-y-6 lg:col-span-1 border-r border-border/70 pr-0 lg:pr-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-primary" /> Parameter Simulasi
                </h3>

                <div className="space-y-4">
                  {/* 1. Commodity selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Komoditas Utama</label>
                    <select
                      value={simComId}
                      onChange={(e) => setSimComId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {COMMODITIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name} (Acuan: Rp {c.basePrice.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Source selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Wilayah Asal (Surplus)</label>
                    <select
                      value={simSourceId}
                      onChange={(e) => setSimSourceId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Target selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-1">Wilayah Tujuan (Defisit)</label>
                    <select
                      value={simTargetId}
                      onChange={(e) => setSimTargetId(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {REGIONS.filter((r) => r.id !== simSourceId).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Volume slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                      <span>Volume Pasokan (Quantity)</span>
                      <span className="text-primary font-black font-mono text-sm">{simVolume} Ton</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={simVolume}
                      onChange={(e) => setSimVolume(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>1 Ton</span>
                      <span>50 Ton</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={runEconomicSimulation}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md py-5"
                >
                  <Sparkles className="mr-1.5 h-4 w-4 text-white animate-spin" />
                  Jalankan Simulasi AI
                </Button>
              </div>

              {/* Simulation Results (2 span) */}
              <div className="lg:col-span-2 space-y-6">
                {!simulationResult ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border/80 rounded-2xl bg-muted/10 min-h-[300px]">
                    <Brain className="h-12 w-12 text-muted-foreground/35 mb-3" />
                    <h4 className="text-sm font-bold text-foreground/80 mb-1">Mulai Pemodelan Simulasi Pangan</h4>
                    <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                      Pilih parameter di sisi kiri dan klik tombol untuk menghasilkan prediksi data harga, peredaman volatilitas, dan estimasi reduksi risiko inflasi BI.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Sandbox Insight Bar */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-foreground/90">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-emerald-700 dark:text-emerald-400 uppercase text-[9px] tracking-wider mb-0.5">BI AI Economic Simulation Insight</div>
                        <p className="font-semibold">{simulationResult.insight}</p>
                      </div>
                    </div>

                    {/* Volatility & Inflation metrics grid */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="border border-border/80 rounded-xl p-4 bg-muted/20 relative overflow-hidden">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Gauge className="h-3.5 w-3.5 text-red-500" /> Volatilitas Harga
                        </div>
                        <div className="text-3xl font-black text-rose-500 flex items-baseline gap-1">
                          -{simulationResult.volatilityDrop}%
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1 font-semibold">Estimasi peredaman gejolak pasar</div>
                      </div>

                      <div className="border border-border/80 rounded-xl p-4 bg-muted/20 relative overflow-hidden">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Flame className="h-3.5 w-3.5 text-amber-500" /> Reduksi Risiko Inflasi
                        </div>
                        <div className="text-3xl font-black text-amber-500 flex items-baseline gap-1">
                          -{simulationResult.inflationDrop}%
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1 font-semibold">Pemotongan skor inflasi BI</div>
                      </div>

                      <div className="border border-border/80 rounded-xl p-4 bg-muted/20 relative overflow-hidden">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Stabilitas Pasar
                        </div>
                        <div className="text-3xl font-black text-emerald-500 flex items-baseline gap-1">
                          {simulationResult.stabilityIndex}/100
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-1 font-semibold">Indeks keamanaan suplai pangan</div>
                      </div>
                    </div>

                    {/* Chart: price stability & supply gap comparison */}
                    <div className="border border-border/80 rounded-xl p-4 shadow-inner">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-3">
                        Perbandingan Harga & Gap Defisit (Sebelum vs Sesudah Alokasi)
                      </h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={[
                            {
                              name: "Sebelum Simulasi",
                              Harga: simulationResult.currentPrice,
                              Defisit: 100
                            },
                            {
                              name: "Setelah Simulasi",
                              Harga: simulationResult.predictedPrice,
                              Defisit: Math.max(0, 100 - simulationResult.gapCovered)
                            }
                          ]}
                          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis yAxisId="left" name="Harga" unit="/kg" fontSize={10} />
                          <YAxis yAxisId="right" orientation="right" name="Defisit" unit="%" fontSize={10} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar yAxisId="left" dataKey="Harga" fill="#3b82f6" name="Harga Acuan Pasar (Rp)">
                            <Cell fill="#ef4444" />
                            <Cell fill="#10b981" />
                          </Bar>
                          <Bar yAxisId="right" dataKey="Defisit" fill="#f59e0b" name="Gap Defisit Suplai (%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                  </div>
                )}
              </div>

            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* TAB 3: COMPLETE ORDERS DATABASE                              */}
      {/* ============================================================ */}
      {activeTab === "orders" && (
        <Card className="border border-border/80 shadow-md">
          <CardHeader className="bg-muted/10 border-b py-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-amber-500" />
              Complete Supply Distribution Archive & Tracking Database
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead className="py-3 px-4 font-bold text-xs uppercase text-slate-400">Order ID</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Tanggal Buat</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Komoditas</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Asal &rarr; Tujuan</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400 text-right">Volume</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Prioritas</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Status</TableHead>
                  <TableHead className="py-3 px-3 font-bold text-xs uppercase text-slate-400">Reduksi Volatilitas</TableHead>
                  <TableHead className="py-3 px-4 font-bold text-xs uppercase text-slate-400">Dampak Inflasi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-muted-foreground italic text-xs">
                      Arsip distribusi kosong.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => {
                    let statusColor = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                    if (o.status === "Approved") statusColor = "bg-sky-500/10 text-sky-500 border-sky-500/20";
                    else if (o.status === "On Delivery") statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                    else if (o.status === "Completed") statusColor = "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
                    else if (o.status === "Delayed") statusColor = "bg-red-500/10 text-red-500 border-red-500/20";

                    return (
                      <TableRow key={o.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3.5 px-4 font-bold font-mono text-xs text-foreground/90">{o.id}</td>
                        <td className="py-3.5 px-3 text-xs text-muted-foreground font-semibold">
                          {safeFormatDate(o.createdAt)} {safeFormatTime(o.createdAt)}
                        </td>
                        <td className="py-3.5 px-3 font-medium text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="text-lg">{comIcon(o.commodityId)}</span>
                            {o.commodityName}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs">
                          <div className="font-semibold text-foreground/90 leading-tight">
                            {o.sourceName || ""}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            &rarr; {o.targetName || ""}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-black tabular-nums text-xs">
                          {(o.quantityKg / 1000).toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground">Ton</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <Badge className={`text-[9px] font-extrabold ${
                            o.priority === "High" ? "bg-red-500" : o.priority === "Medium" ? "bg-amber-500" : "bg-slate-500"
                          }`}>
                            {o.priority}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-3">
                          <Badge variant="outline" className={`text-[9px] font-extrabold capitalize ${statusColor}`}>
                            {o.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-xs font-black text-center tabular-nums">
                          {o.volatilityImpact ? `-${o.volatilityImpact}%` : "-"}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs font-black tabular-nums text-emerald-500">
                          {o.inflationImpact ? `-${o.inflationImpact}%` : "-"}
                        </td>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 3. Regency Surplus/Deficit Table Summary (Rendered globally at the bottom) */}
      <Card className="border border-border/80 shadow-md">
        <CardHeader className="py-4 px-5 border-b bg-muted/10">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Ringkasan Neraca Surplus / Defisit per Wilayah (Standard K-Means)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-400 bg-muted/20">
                <th className="py-3 px-5 font-bold">Wilayah Administratif</th>
                <th className="py-3 px-3 text-right font-bold">Total Supply</th>
                <th className="py-3 px-3 text-right font-bold">Total Demand</th>
                <th className="py-3 px-3 text-right font-bold">Selisih Bersih (Net)</th>
                <th className="py-3 px-5 font-bold">Cluster AI (K-Means)</th>
              </tr>
            </TableHeader>
            <TableBody>
              {kmeansData && kmeansData.metrics
                .slice()
                .sort((a, b) => b.surplusDeficit - a.surplusDeficit)
                .map((m) => {
                  let badgeColor = "border-slate-500/20 text-slate-500";
                  if (m.cluster === "Surplus Tinggi") badgeColor = "border-emerald-500/25 text-emerald-600 bg-emerald-500/5";
                  else if (m.cluster === "Surplus Sedang") badgeColor = "border-lime-500/25 text-lime-600 bg-lime-500/5";
                  else if (m.cluster === "Stabil") badgeColor = "border-sky-500/25 text-sky-600 bg-sky-500/5";
                  else if (m.cluster === "Defisit Sedang") badgeColor = "border-orange-500/25 text-orange-600 bg-orange-500/5";
                  else if (m.cluster === "Defisit Tinggi") badgeColor = "border-red-500/25 text-red-600 bg-red-500/5";

                  return (
                    <TableRow key={m.regionId} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-5 font-bold text-xs text-foreground/90">{name(m.regionId)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs font-semibold">{m.totalSupply.toLocaleString("id-ID")} kg</td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs font-semibold">{m.totalDemand.toLocaleString("id-ID")} kg</td>
                      <td className={`py-3 px-3 text-right tabular-nums font-black text-xs ${m.surplusDeficit >= 0 ? "text-supply" : "text-deficit"}`}>
                        {m.surplusDeficit > 0 ? "+" : ""}
                        {m.surplusDeficit.toLocaleString("id-ID")} kg
                      </td>
                      <td className="py-3 px-5">
                        <Badge variant="outline" className={`font-extrabold uppercase text-[9px] ${badgeColor}`}>
                          {m.cluster}
                        </Badge>
                      </td>
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
