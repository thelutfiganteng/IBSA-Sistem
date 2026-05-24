import { useEffect, useRef } from "react";
import type { GisRegionData, DistributionFlow } from "@/lib/price-intel";
import { SUMSEL_GEOJSON } from "@/lib/sumselGeojson";
import { MARKETS } from "@/lib/seed";
import "leaflet/dist/leaflet.css";

// 5-Level AI Clustering Color Scale
const CLUSTER_METADATA = {
  "Surplus Tinggi": { color: "#15803d", label: "Surplus Tinggi" },
  "Surplus Sedang": { color: "#84cc16", label: "Surplus Sedang" },
  "Stabil": { color: "#0ea5e9", label: "Stabil" },
  "Defisit Sedang": { color: "#f97316", label: "Defisit Sedang" },
  "Defisit Tinggi": { color: "#dc2626", label: "Defisit Tinggi" },
} as const;

export function getClusterName(surplus: number): keyof typeof CLUSTER_METADATA {
  if (surplus >= 150) return "Surplus Tinggi";
  if (surplus > 30) return "Surplus Sedang";
  if (surplus >= -30) return "Stabil";
  if (surplus >= -150) return "Defisit Sedang";
  return "Defisit Tinggi";
}

export function getClusterColor(surplus: number): string {
  return CLUSTER_METADATA[getClusterName(surplus)].color;
}

interface Props {
  data: GisRegionData[];
  flows?: DistributionFlow[];
  showBoundaries?: boolean;
  showHeatmap?: boolean;
  showFlows?: boolean;
  showWeather?: boolean;
  showLogistics?: boolean;
  showMarkets?: boolean;
  height?: number | string;
  onSelectRegion?: (regionId: string) => void;
  selectedRegionId?: string;
}

export function GisFoodMap({
  data,
  flows = [],
  showBoundaries = true,
  showHeatmap = true,
  showFlows = true,
  showWeather = true,
  showLogistics = true,
  showMarkets = true,
  height = 560,
  onSelectRegion,
  selectedRegionId,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    let layersToCleanup: any[] = [];
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      if (typeof window === "undefined" || !ref.current) return;
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      
      if (!active || !ref.current) return;

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
          .custom-market-marker {
            transition: all 0.3s ease;
          }
          .custom-market-marker:hover {
            transform: scale(1.1) translateY(-2px);
            filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));
          }
        `;
        document.head.appendChild(style);
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Initialize map with a premium control view
      const map = L.map(ref.current, { 
        zoomControl: true,
        attributionControl: false 
      }).setView([-3.3, 104.0], 7.5);
      
      mapRef.current = map;

      // Resize listener to invalidate map size and ensure responsiveness
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }

      // Premium CartoDB Tile Layer depending on active theme
      const isDark = document.documentElement.classList.contains("dark");
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

      L.tileLayer(tileUrl, {
        maxZoom: 18,
      }).addTo(map);

      // 1. Boundary & Choropleth GeoJSON Layer
      if (showBoundaries) {
        const geojsonLayer = L.geoJSON(SUMSEL_GEOJSON as any, {
          style: (feature: any) => {
            const rId = feature.properties.id;
            const regionData = data.find((r) => r.regionId === rId);
            const cluster = regionData?.cluster ?? "Stabil";
            const color = CLUSTER_METADATA[cluster]?.color ?? "#0ea5e9";
            const isSelected = selectedRegionId === rId;

            return {
              fillColor: color,
              fillOpacity: isSelected ? 0.8 : 0.55,
              color: isSelected ? "#22d3ee" : isDark ? "#4b5563" : "#cbd5e1",
              weight: isSelected ? 3 : 1.5,
              opacity: 1,
            };
          },
          onEachFeature: (feature: any, layer: any) => {
            const rId = feature.properties.id;
            const regionData = data.find((r) => r.regionId === rId);

            if (regionData) {
              const surplusColor = CLUSTER_METADATA[regionData.cluster ?? "Stabil"]?.color ?? "#0ea5e9";
              const clusterText = regionData.cluster ?? "Stabil";
              const warningAlert = regionData.inflationScore > 70 
                ? `<div style="margin-top:6px; color:#ef4444; font-weight:bold; display:flex; align-items:center; gap:4px">⚠️ AI Inflasi Tinggi (${regionData.inflationScore}/100)</div>`
                : "";

              // Tooltip on Hover
              const weatherTooltip = regionData.bmkgDesc 
                ? `<br/>Cuaca BMKG: <b>${regionData.bmkgDesc} (${regionData.bmkgTemp}°C)</b>`
                : "";

              layer.bindTooltip(
                `<div style="font-family:system-ui,sans-serif; padding:4px 6px;">
                  <b style="font-size:13px">${regionData.regionName}</b><br/>
                  Cluster: <span style="color:${surplusColor}; font-weight:bold">${clusterText}</span><br/>
                  Net Supply: <b>${regionData.surplus > 0 ? "+" : ""}${regionData.surplus.toLocaleString("id-ID")} kg</b>${weatherTooltip}
                </div>`,
                { sticky: true, opacity: 0.95 }
              );

              // Interactive Hover Effects
              layer.on({
                mouseover: (e: any) => {
                  const targetLayer = e.target;
                  targetLayer.setStyle({
                    weight: 3,
                    color: "#06b6d4",
                    fillOpacity: 0.75,
                  });
                  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                    targetLayer.bringToFront();
                  }
                },
                mouseout: (e: any) => {
                  const targetLayer = e.target;
                  const isSelected = selectedRegionId === rId;
                  targetLayer.setStyle({
                    weight: isSelected ? 3 : 1.5,
                    color: isSelected ? "#22d3ee" : isDark ? "#4b5563" : "#cbd5e1",
                    fillOpacity: isSelected ? 0.8 : 0.55,
                  });
                },
                click: () => {
                  if (onSelectRegion) {
                    onSelectRegion(rId);
                  }
                },
              });
            }
          },
        }).addTo(map);
        layersToCleanup.push(geojsonLayer);
      }

      // 2. Heatmap Inflasi (Transparent Glowing Overlays around High Volatility Regions)
      if (showHeatmap) {
        data
          .filter((r) => r.inflationScore > 50)
          .forEach((r) => {
            const color = r.inflationScore > 75 ? "#dc2626" : "#f59e0b";
            const radialGlow = L.circle([r.lat, r.lng], {
              radius: 18000 + r.inflationScore * 180,
              color: color,
              fillColor: color,
              fillOpacity: 0.15,
              weight: 0,
            }).addTo(map);
            layersToCleanup.push(radialGlow);
          });
      }

      // 3. Titik Pasar Induk Layer (🏪 glowing indicators)
      if (showMarkets) {
        MARKETS.forEach((m) => {
          const marketMarker = L.marker([m.lat, m.lng], {
            icon: L.divIcon({
              className: "custom-market-marker",
              html: `<div style="background:#2563eb; color:white; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:30px; border:2px solid #ffffff; box-shadow:0 3px 6px rgba(0,0,0,0.3); display:flex; align-items:center; gap:4px; white-space:nowrap;">🏪 ${m.name.replace("Pasar ", "")}</div>`,
              iconSize: [120, 24],
              iconAnchor: [60, 12],
            }),
          })
            .addTo(map)
            .bindPopup(
              `<div style="font-family:system-ui,sans-serif; min-width:180px;">
                <b style="font-size:14px; color:#1e40af;">${m.name}</b><br/>
                <span style="color:#6b7280; font-size:12px;">Wilayah: Kota ${m.region.toUpperCase()}</span><br/>
                <hr style="margin:6px 0; border:0; border-top:1px solid #e5e7eb;" />
                <div style="font-size:11px; color:#10b981;">🟢 GPS Node Active</div>
              </div>`
            );
          layersToCleanup.push(marketMarker);
        });
      }

      // 4. Weather Overlays (BMKG symbols)
      if (showWeather) {
        data
          .filter((r) => r.weather !== "cerah")
          .forEach((r) => {
            const weatherIcon = L.marker([r.lat + 0.15, r.lng - 0.15], {
              icon: L.divIcon({
                className: "",
                html: `<div style="font-size:24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25)); cursor:pointer;" title="Cuaca: ${r.weather.toUpperCase()}">${r.weather === "badai" ? "⛈️" : "🌧️"}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
              }),
            })
              .addTo(map)
              .bindPopup(`<b>Cuaca Peringatan</b><br/>Wilayah: ${r.regionName}<br/>Kondisi: ${r.weather.toUpperCase()}`);
            layersToCleanup.push(weatherIcon);
          });
      }

      // 5. Logistics Overlays (lancar, padat, macet path highlights or signs)
      if (showLogistics) {
        data.forEach((r) => {
          if (r.logistics !== "lancar") {
            const color = r.logistics === "macet" ? "#ef4444" : "#f59e0b";
            const label = r.logistics === "macet" ? "🚨 Macet" : "⚠️ Padat";
            const logisticsMarker = L.marker([r.lat - 0.15, r.lng + 0.15], {
              icon: L.divIcon({
                className: "",
                html: `<div style="background:${color}; color:white; font-size:9px; font-weight:bold; padding:2px 5px; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); white-space:nowrap;">${label}</div>`,
                iconSize: [50, 16],
                iconAnchor: [25, 8],
              }),
            })
              .addTo(map)
              .bindPopup(`<b>Kondisi Rute Logistik</b><br/>Wilayah: ${r.regionName}<br/>Status Jalan: ${r.logistics.toUpperCase()}`);
            layersToCleanup.push(logisticsMarker);
          }
        });
      }

      // 6. Jalur Distribusi (Animated Flow Lines with directional motion)
      if (showFlows) {
        flows.forEach((f) => {
          const flowColor = "#06b6d4"; // Vibrant cyan flow line
          const animatedLine = L.polyline(
            [
              [f.fromLat, f.fromLng],
              [f.toLat, f.toLng],
            ],
            {
              color: flowColor,
              weight: 3.5,
              className: "leaflet-animated-flow", // Animates the dash offset via CSS
              opacity: 0.85,
            }
          ).addTo(map);

          animatedLine.bindPopup(
            `<div style="font-family:system-ui,sans-serif; min-width:200px;">
              <b style="color:#0891b2; font-size:12px; text-transform:uppercase; tracking-wide:0.05em;">Rekomendasi AI Aliran Pangan</b>
              <div style="font-size:14px; font-weight:bold; margin-top:3px;">${f.fromName} &rarr; ${f.toName}</div>
              <hr style="margin:6px 0; border:0; border-top:1px solid #e5e7eb;" />
              Volume: <b style="color:#10b981;">${f.volume.toLocaleString("id-ID")} kg</b><br/>
              Komoditas: <b>${f.komoditas}</b>
            </div>`
          );
          layersToCleanup.push(animatedLine);

          // Add a subtle small directional marker at the midpoint to clarify direction
          const midLat = (f.fromLat + f.toLat) / 2;
          const midLng = (f.fromLng + f.toLng) / 2;
          const directionNode = L.circleMarker([midLat, midLng], {
            radius: 5,
            fillColor: "#ffffff",
            color: "#06b6d4",
            weight: 2,
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(`Arah Aliran: ${f.fromName} menuju ${f.toName}`);
          layersToCleanup.push(directionNode);
        });
      }
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
  }, [
    data,
    flows,
    showBoundaries,
    showHeatmap,
    showFlows,
    showWeather,
    showLogistics,
    showMarkets,
    selectedRegionId,
  ]);

  // Calculate active statistics for the 5-Level Cluster Legend
  const totalRegions = data.length || 1;
  const stats = Object.entries(CLUSTER_METADATA).map(([key, value]) => {
    const count = data.filter((r) => r.cluster === key).length;
    const pct = Math.round((count / totalRegions) * 100);
    return { name: key, color: value.color, count, pct };
  });

  return (
    <div className="relative">
      <div 
        ref={ref} 
        style={typeof height === "number" ? { height } : undefined} 
        className={`w-full rounded-2xl border bg-card shadow-inner overflow-hidden ${typeof height === "string" ? height : ""}`} 
      />

      {/* Futuristic Floating GIS Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-border/80 bg-background/85 p-4 shadow-xl backdrop-blur-md max-w-xs transition-all hover:bg-background/95">
        <div className="mb-2 font-bold text-xs uppercase tracking-wider text-muted-foreground">
          Legenda AI Clustering Wilayah
        </div>
        <div className="space-y-2">
          {stats.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4 text-xs font-medium">
              <div className="flex items-center gap-2">
                <span 
                  className="inline-block h-3 w-3 rounded-full shadow-sm ring-1 ring-black/10" 
                  style={{ backgroundColor: s.color }} 
                />
                <span className="text-foreground/90">{s.name}</span>
              </div>
              <div className="flex items-center gap-1.5 tabular-nums text-muted-foreground font-semibold">
                <span>{s.count} wilayah</span>
                <span className="text-[10px] bg-muted px-1 py-0.5 rounded text-foreground/75 font-normal">
                  {s.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Legend for active Layers */}
        {(showFlows || showMarkets) && (
          <div className="mt-3 border-t pt-3 space-y-1.5">
            {showFlows && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <div className="relative flex h-1.5 w-6 overflow-hidden rounded bg-cyan-500/30">
                  <div className="h-full w-3 animate-[leaflet-flow-anim_1.5s_linear_infinite] bg-cyan-400" style={{ backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)" }} />
                </div>
                <span>Jalur Distribusi AI (Flow)</span>
              </div>
            )}
            {showMarkets && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <span className="flex h-4 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white ring-1 ring-white">
                  🏪
                </span>
                <span>Titik Pasar Induk Pangan</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
