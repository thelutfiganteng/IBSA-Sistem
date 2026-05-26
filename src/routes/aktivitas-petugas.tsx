import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabaseAdmin } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { COMMODITIES, MARKETS, REGIONS } from "@/lib/seed";
import { 
  Activity, 
  Search, 
  MapPin, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  ShieldAlert,
  AlertTriangle, 
  RefreshCw, 
  Camera, 
  SlidersHorizontal,
  Scale
} from "lucide-react";
import type { WeighRecord } from "@/lib/types";

export const Route = createFileRoute("/aktivitas-petugas")({
  component: AktivitasPetugasPage,
});

function AktivitasPetugasPage() {
  const { user, mounted } = useAuthUser();
  const navigate = useNavigate();

  const [records, setRecords] = useState<WeighRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMarket, setSelectedMarket] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");

  // Modal screenshot state
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [activeRecord, setActiveRecord] = useState<WeighRecord | null>(null);

  const loadData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabaseAdmin
        .from("weigh_records")
        .select("*")
        .order("tanggal", { ascending: false });

      if (!error && data) {
        const mapped: WeighRecord[] = data.map((dbRow: any) => ({
          id: dbRow.id,
          tanggal: dbRow.tanggal,
          komoditasId: dbRow.komoditas_id,
          berat: Number(dbRow.berat),
          harga: Number(dbRow.harga),
          pasarId: dbRow.pasar_id,
          petugas: dbRow.petugas,
          foto: dbRow.foto || "",
          lokasi: dbRow.lokasi,
          status_supply: dbRow.status_supply,
          aiLabel: dbRow.ai_label,
        }));
        setRecords(mapped);
      }
    } catch (err) {
      console.error("Gagal memuat log aktivitas timbang:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (mounted && user && ['pemprov', 'dinas'].includes(user.role)) {
      loadData();
    }
  }, [mounted, user]);

  // Handle resets
  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedMarket("all");
    setSelectedRegion("all");
    setSelectedDate("");
  };

  // Filtered records
  const filteredRecords = records.filter(r => {
    const matchesSearch = r.petugas.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.lokasi.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMarket = selectedMarket === "all" || r.pasarId === selectedMarket;
    const marketInfo = MARKETS.find(m => m.id === r.pasarId);
    const matchesRegion = selectedRegion === "all" || (marketInfo && marketInfo.region === selectedRegion);
    const matchesDate = !selectedDate || r.tanggal.startsWith(selectedDate);
    return matchesSearch && matchesMarket && matchesRegion && matchesDate;
  });

  // Derived stats
  const totalInputsToday = records.filter(r => {
    const today = new Date().toISOString().split("T")[0];
    return r.tanggal.startsWith(today);
  }).length;

  const activeOfficersToday = new Set(
    records
      .filter(r => r.tanggal.startsWith(new Date().toISOString().split("T")[0]))
      .map(r => r.petugas)
  ).size;

  const anomalyCountToday = records.filter(r => {
    const today = new Date().toISOString().split("T")[0];
    const isAnomaly = r.aiLabel?.toLowerCase().includes("anomaly") || r.aiLabel?.toLowerCase().includes("mismatch");
    return r.tanggal.startsWith(today) && isAnomaly;
  }).length;

  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground bg-background">
        Mengautentikasi Sesi...
      </div>
    );
  }

  // Elegant access restriction card if unauthorized role tries to access
  if (user && !['pemprov', 'dinas'].includes(user.role)) {
    return (
      <AppShell>
        <div className="container mx-auto max-w-md px-4 py-16 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="p-4 bg-deficit/10 rounded-full border border-deficit/20 animate-pulse">
            <ShieldAlert className="h-16 w-16 text-deficit" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight text-foreground">Akses Terbatas</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Halaman ini eksklusif dan hanya dapat diakses oleh akun <b>Pemerintah Provinsi (Pemprov)</b> dan <b>Dinas Pangan</b>.
            </p>
          </div>
          <Button onClick={() => navigate({ to: "/timbangan" })} className="w-full">
            Kembali ke Timbangan Digital
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container mx-auto px-1 sm:px-4 max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-sidebar-border/10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse shrink-0" />
              Log Aktivitas Timbang Petugas
            </h2>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
              Halaman pengawasan untuk memantau detail petugas lapangan, pasar, kota/kabupaten, dan timestamp realtime.
            </p>
          </div>
          <div className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
              className="gap-2 text-xs w-full sm:w-auto shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
              Perbarui Log
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="glass border-primary/10 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="absolute top-3 right-3 p-2 opacity-10 text-primary group-hover:scale-110 transition-transform">
              <Clock className="h-10 w-10" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">Total Input Hari Ini</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-extrabold text-foreground">{totalInputsToday} Kali</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Transaksi penimbangan yang masuk hari ini.</p>
            </CardContent>
          </Card>

          <Card className="glass border-primary/10 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="absolute top-3 right-3 p-2 opacity-10 text-primary group-hover:scale-110 transition-transform">
              <Scale className="h-10 w-10" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">Petugas Aktif Hari Ini</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-extrabold text-foreground">{activeOfficersToday} Orang</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Jumlah personel aktif melaporkan dari lapangan.</p>
            </CardContent>
          </Card>

          <Card className="glass border-primary/10 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all sm:col-span-2 lg:col-span-1">
            <div className="absolute top-3 right-3 p-2 opacity-10 text-deficit group-hover:scale-110 transition-transform">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">Anomali Hari Ini</CardDescription>
              <CardTitle className={`text-2xl sm:text-3xl font-extrabold ${anomalyCountToday > 0 ? "text-deficit animate-pulse" : "text-foreground"}`}>
                {anomalyCountToday} Kasus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Jumlah ketidaksesuaian klasifikasi AI hari ini.</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Section */}
        <Card className="border-sidebar-border bg-card/40 backdrop-blur-xl">
          <CardHeader className="pb-3 border-b border-sidebar-border/20 py-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Filter Pengawasan
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search by name/location */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Cari Petugas / Lokasi</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9 bg-card/60 w-full"
                />
              </div>
            </div>

            {/* Filter by Market */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Pasar Induk</Label>
              <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                <SelectTrigger className="text-xs h-9 bg-card/60 w-full">
                  <SelectValue placeholder="Semua Pasar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Pasar</SelectItem>
                  {MARKETS.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Region */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Kota / Kabupaten</Label>
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="text-xs h-9 bg-card/60 w-full">
                  <SelectValue placeholder="Semua Wilayah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Wilayah</SelectItem>
                  {REGIONS.map(r => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Date */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Tanggal Input</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs h-9 bg-card/60 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleResetFilters}
                  className="text-xs h-9 px-3 shrink-0"
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Table logs */}
        <Card className="shadow-lg border-sidebar-border overflow-hidden">
          <CardHeader className="py-4 border-b border-sidebar-border/30 bg-muted/20">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Daftar Transaksi Timbang Realtime</span>
              <Badge variant="outline" className="text-xs border-primary/20 text-primary">
                {filteredRecords.length} Log Aktivitas
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="grid place-items-center h-64">
                <div className="text-muted-foreground flex flex-col items-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary mb-2" />
                  Memuat log aktivitas petugas dari Supabase...
                </div>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="grid place-items-center h-64 text-muted-foreground px-4 text-center">
                Tidak ada aktivitas log yang sesuai dengan kriteria filter.
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[900px] w-full">
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs font-bold uppercase w-[70px] px-4 py-3">Foto</TableHead>
                      <TableHead className="text-xs font-bold uppercase w-[160px] px-4 py-3">Pukul &amp; Tanggal</TableHead>
                      <TableHead className="text-xs font-bold uppercase px-4 py-3">Petugas</TableHead>
                      <TableHead className="text-xs font-bold uppercase px-4 py-3">Pasar Induk</TableHead>
                      <TableHead className="text-xs font-bold uppercase px-4 py-3">Kota / Kabupaten</TableHead>
                      <TableHead className="text-xs font-bold uppercase px-4 py-3">Komoditas</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right px-4 py-3">Berat (Riil)</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right px-4 py-3">Total Harga</TableHead>
                      <TableHead className="text-xs font-bold uppercase px-4 py-3">Validasi AI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((r) => {
                      const com = COMMODITIES.find(c => c.id === r.komoditasId);
                      const market = MARKETS.find(m => m.id === r.pasarId);
                      const regionName = REGIONS.find(reg => reg.id === market?.region)?.name || "Sumatera Selatan";
                      const dateObj = new Date(r.tanggal);
                      const displayTime = dateObj.toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " WIB";
                      const displayDate = dateObj.toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' });
                      
                      const isAnomaly = r.aiLabel?.toLowerCase().includes("anomaly") || r.aiLabel?.toLowerCase().includes("mismatch");

                      return (
                        <TableRow key={r.id} className="hover:bg-muted/20 border-b border-sidebar-border/20 transition-all group">
                          <TableCell className="p-3 px-4">
                            <div 
                              className="h-10 w-12 rounded-md overflow-hidden bg-black border border-sidebar-border relative cursor-pointer group-hover:scale-105 transition-transform flex items-center justify-center shadow-inner"
                              onClick={() => {
                                setSelectedPhoto(r.foto || com?.icon || "");
                                setActiveRecord(r);
                              }}
                              title="Klik untuk memperbesar jepretan"
                            >
                              {r.foto ? (
                                <img src={r.foto} alt="capture" className="h-full w-full object-cover" />
                              ) : (
                                <div className="text-xl opacity-60">{com?.icon || "🌾"}</div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="h-3.5 w-3.5 text-white" />
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="p-3 px-4 font-mono text-xs">
                            <div className="font-bold text-foreground">{displayTime}</div>
                            <div className="text-muted-foreground text-[10px] flex items-center gap-1 mt-0.5">
                              <Calendar className="h-3 w-3 shrink-0" /> {displayDate}
                            </div>
                          </TableCell>

                          <TableCell className="p-3 px-4">
                            <div className="font-semibold text-sm text-foreground">{r.petugas}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">Verified Officer</div>
                          </TableCell>

                          <TableCell className="p-3 px-4">
                            <div className="font-medium text-xs text-foreground">{r.lokasi}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0 text-primary" /> ID: {r.pasarId}
                            </div>
                          </TableCell>

                          <TableCell className="p-3 px-4">
                            <Badge variant="outline" className="bg-sidebar-accent/50 text-[10px] font-semibold border-sidebar-border/30">
                              {regionName}
                            </Badge>
                          </TableCell>

                          <TableCell className="p-3 px-4">
                            <div className="text-sm font-semibold flex items-center gap-1.5">
                              <span className="text-base">{com?.icon || "🌾"}</span>
                              <span>{com?.name || r.komoditasId}</span>
                            </div>
                          </TableCell>

                          <TableCell className="p-3 px-4 text-right font-mono font-bold text-sm text-foreground">
                            {r.berat} kg
                          </TableCell>

                          <TableCell className="p-3 px-4 text-right font-mono font-bold text-xs text-primary">
                            Rp{(r.berat * r.harga).toLocaleString("id-ID")}
                          </TableCell>

                          <TableCell className="p-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold px-2 py-0.5 ${
                                isAnomaly 
                                  ? "border-deficit/50 text-deficit bg-deficit/5 animate-pulse" 
                                  : "border-supply/45 text-supply bg-supply/5"
                              }`}
                            >
                              {isAnomaly ? (
                                <><AlertTriangle className="mr-1 h-3 w-3 shrink-0" /> Anomali AI</>
                              ) : (
                                <><ShieldCheck className="mr-1 h-3 w-3 shrink-0" /> Verified</>
                              )}
                            </Badge>
                            <div className="text-[9px] text-muted-foreground mt-1 truncate max-w-[140px]" title={r.aiLabel}>
                              {r.aiLabel || "Aman"}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Screenshot Viewer Modal */}
        <Dialog open={selectedPhoto !== null} onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}>
          <DialogContent className="glass border-primary/20 max-w-md w-[92%] rounded-xl bg-sidebar/95 text-sidebar-foreground shadow-2xl backdrop-blur-2xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-sm sm:text-base uppercase tracking-wider flex items-center gap-2 border-b border-sidebar-border/40 pb-2">
                <Camera className="h-5 w-5 text-primary" /> Tangkapan Kamera Timbangan Pintar
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
                File audit kamera biometrik ter-enkripsi.
              </DialogDescription>
            </DialogHeader>

            {activeRecord && (
              <div className="space-y-4 pt-2">
                {/* Snapshot Frame */}
                <div className="relative border border-primary/30 rounded-xl overflow-hidden shadow-2xl bg-black aspect-video flex items-center justify-center w-full">
                  {selectedPhoto && (selectedPhoto.startsWith("data:") || selectedPhoto?.startsWith("http")) ? (
                    <img src={selectedPhoto} alt="Webcam capture" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-6xl p-6 bg-muted/10 rounded-full">{selectedPhoto || "📸"}</div>
                  )}
                  {/* HUD Camera details */}
                  <div className="absolute top-3 left-3 bg-black/60 border border-white/10 px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-mono flex items-center gap-1.5 backdrop-blur-md">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                    REC SECURE FEED
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/60 border border-white/10 px-2 py-0.5 rounded text-[8px] sm:text-[9px] font-mono backdrop-blur-md">
                    {new Date(activeRecord.tanggal).toLocaleString("id-ID")}
                  </div>
                </div>

                {/* Transaction details card */}
                <div className="p-3 rounded-lg border border-sidebar-border bg-black/30 font-mono text-[10px] sm:text-xs space-y-2 grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground block uppercase">Petugas Timbang</span>
                    <span className="font-bold text-foreground truncate block">{activeRecord.petugas}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground block uppercase">Lokasi Penugasan</span>
                    <span className="font-bold text-foreground truncate block">{activeRecord.lokasi}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground block uppercase">Komoditas &amp; Berat</span>
                    <span className="font-bold text-primary truncate block">
                      {COMMODITIES.find(c => c.id === activeRecord.komoditasId)?.name || activeRecord.komoditasId} ({activeRecord.berat} kg)
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-muted-foreground block uppercase">Status Audit AI</span>
                    <span className={`font-bold truncate block ${
                      activeRecord.aiLabel?.toLowerCase().includes("anomaly") || activeRecord.aiLabel?.toLowerCase().includes("mismatch")
                        ? "text-deficit animate-pulse"
                        : "text-supply"
                    }`}>
                      {activeRecord.aiLabel || "Verified (Clean)"}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={() => setSelectedPhoto(null)} className="text-xs h-8">
                    Tutup Auditor
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
