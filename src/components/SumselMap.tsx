import { useEffect, useRef } from "react";
import type { RegionMetric } from "@/lib/types";
import { SUMSEL_GEOJSON } from "@/lib/sumselGeojson";
import "leaflet/dist/leaflet.css";

// 6-Level AI Clustering Color Scale matching the design system
const CLUSTER_COLORS: Record<string, string> = {
  "Surplus Tinggi": "#15803d",
  "Surplus Sedang": "#84cc16",
  "Stabil": "#0ea5e9",
  "Defisit Sedang": "#f97316",
  "Defisit Tinggi": "#dc2626",
  "Krisis Pangan": "#7f1d1d",
};

export function SumselMap({ metrics }: { metrics: RegionMetric[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    (async () => {
      if (typeof window === "undefined" || !ref.current) return;
      const L = (await import("leaflet")).default;

      if (!active || !ref.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Initialize map centering on South Sumatra
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

      // Professional CartoDB map tile layer responsive to theme
      const isDark = document.documentElement.classList.contains("dark");
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

      L.tileLayer(tileUrl, {
        maxZoom: 18,
      }).addTo(map);

      // Render South Sumatra boundary polygons
      L.geoJSON(SUMSEL_GEOJSON as any, {
        style: (feature: any) => {
          const rId = feature.properties.id;
          const metric = metrics.find((m) => m.regionId === rId);
          const cluster = metric?.cluster ?? "Stabil";
          const color = CLUSTER_COLORS[cluster] || "#0ea5e9";

          return {
            fillColor: color,
            fillOpacity: 0.6,
            color: isDark ? "#4b5563" : "#cbd5e1",
            weight: 1.5,
            opacity: 1,
          };
        },
        onEachFeature: (feature: any, layer: any) => {
          const rId = feature.properties.id;
          const metric = metrics.find((m) => m.regionId === rId);

          if (metric) {
            const cluster = metric.cluster ?? "Stabil";
            const color = CLUSTER_COLORS[cluster] || "#0ea5e9";

            // Interactive Tooltip
            layer.bindTooltip(
              `<div style="font-family:system-ui,sans-serif; padding:4px 6px;">
                <b style="font-size:13px">${metric.regionName || feature.properties.name}</b><br/>
                Cluster: <span style="color:${color}; font-weight:bold">${cluster}</span><br/>
                Surplus: <b>${metric.surplusDeficit > 0 ? "+" : ""}${metric.surplusDeficit.toLocaleString("id-ID")} kg</b>
              </div>`,
              { sticky: true }
            );

            // Hover Highlights
            layer.on({
              mouseover: (e: any) => {
                const targetLayer = e.target;
                targetLayer.setStyle({
                  weight: 2.5,
                  color: "#06b6d4",
                  fillOpacity: 0.75,
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  targetLayer.bringToFront();
                }
              },
              mouseout: (e: any) => {
                const targetLayer = e.target;
                targetLayer.setStyle({
                  weight: 1.5,
                  color: isDark ? "#4b5563" : "#cbd5e1",
                  fillOpacity: 0.6,
                });
              },
            });
          }
        },
      }).addTo(map);
    })();

    return () => {
      active = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [metrics]);

  const total = metrics.length || 1;
  const stats = Object.entries(CLUSTER_COLORS).map(([key, color]) => {
    const count = metrics.filter((m) => m.cluster === key).length;
    const pct = Math.round((count / total) * 100);
    return { name: key, color, count, pct };
  });

  return (
    <div className="relative">
      <div ref={ref} className="h-[320px] md:h-[460px] w-full rounded-2xl border bg-card shadow-inner overflow-hidden" />
      
      {/* Floating Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] rounded-xl border border-border/80 bg-background/85 p-3 shadow-lg backdrop-blur-sm max-w-xs">
        <div className="mb-1.5 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
          Legend Cluster
        </div>
        <div className="space-y-1.5">
          {stats.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-[11px] font-medium">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-foreground/90">{s.name}</span>
              </div>
              <div className="flex items-center gap-1 tabular-nums text-muted-foreground font-semibold">
                <span>{s.count}</span>
                <span className="text-[9px] bg-muted px-1 rounded text-foreground/75 font-normal">
                  {s.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
