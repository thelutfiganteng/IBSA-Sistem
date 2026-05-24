import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { COMMODITIES, MARKETS, REGIONS } from "@/lib/seed";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import type { AuditEntry } from "@/lib/types";

export const Route = createFileRoute("/laporan")({ component: LaporanPage });

function LaporanPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const mounted = useMounted();
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (mounted) setAudit(store.audit.get());
  }, [mounted]);

  if (!mounted) return <div className="text-muted-foreground">Memuat…</div>;

  const weighs = store.weighs.get();
  const metrics = applyClusters(computeRegionMetrics(weighs));

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const weighRows = weighs.map((w) => ({
      tanggal: new Date(w.tanggal).toLocaleString("id-ID"),
      komoditas: COMMODITIES.find((c) => c.id === w.komoditasId)?.name,
      berat_kg: w.berat,
      harga: w.harga,
      pasar: MARKETS.find((m) => m.id === w.pasarId)?.name,
      petugas: w.petugas,
      status: w.status_supply,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weighRows), "Timbangan");

    const regionRows = metrics.map((m) => ({
      daerah: REGIONS.find((r) => r.id === m.regionId)?.name,
      supply_kg: m.totalSupply,
      demand_kg: m.totalDemand,
      selisih: m.surplusDeficit,
      avg_harga: m.avgPrice,
      stok_gudang: m.warehouseStock,
      cluster: m.cluster,
      risiko_inflasi: m.inflationRisk,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regionRows), "Wilayah");

    XLSX.writeFile(wb, `laporan-pangan-sumsel-${Date.now()}.xlsx`);
    toast.success("Excel diunduh");
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Laporan Smart Food Sumsel", 14, 18);
    doc.setFontSize(10);
    doc.text(`Tanggal: ${new Date().toLocaleString("id-ID")}`, 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [["Daerah", "Supply", "Demand", "Selisih", "Cluster", "Inflasi"]],
      body: metrics.map((m) => [
        REGIONS.find((r) => r.id === m.regionId)?.name ?? "",
        `${m.totalSupply} kg`,
        `${m.totalDemand} kg`,
        m.surplusDeficit,
        m.cluster ?? "",
        m.inflationRisk ?? "",
      ]),
      headStyles: { fillColor: [30, 64, 124] },
    });

    autoTable(doc, {
      head: [["Tanggal", "Komoditas", "Berat", "Harga", "Pasar", "Petugas"]],
      body: weighs
        .slice(0, 40)
        .map((w) => [
          new Date(w.tanggal).toLocaleDateString("id-ID"),
          COMMODITIES.find((c) => c.id === w.komoditasId)?.name ?? "",
          `${w.berat} kg`,
          `Rp ${w.harga.toLocaleString("id-ID")}`,
          MARKETS.find((m) => m.id === w.pasarId)?.name ?? "",
          w.petugas,
        ]),
      headStyles: { fillColor: [30, 64, 124] },
    });

    doc.save(`laporan-pangan-sumsel-${Date.now()}.pdf`);
    toast.success("PDF diunduh");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <CardTitle>Export Excel</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Data timbangan + ringkasan wilayah dalam .xlsx
              </p>
            </div>
            <Button onClick={exportExcel}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <CardTitle>Export PDF</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Laporan rapi siap cetak / kirim
              </p>
            </div>
            <Button onClick={exportPDF}>
              <FileText className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Log Aktivitas ({audit.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.slice(0, 50).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(a.timestamp).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell>{a.user}</TableCell>
                  <TableCell>{a.role}</TableCell>
                  <TableCell>
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                      {a.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
