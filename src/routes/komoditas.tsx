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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { COMMODITIES, MARKETS } from "@/lib/seed";
import { store } from "@/lib/storage";
import { useMounted } from "@/hooks/use-mounted";
import { useAuthUser } from "@/hooks/use-auth";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { WeighRecord } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/komoditas")({ component: KomoditasPage });

function KomoditasPage() {
  return (
    <AppShell>
      <KomoditasInner />
    </AppShell>
  );
}

function KomoditasInner() {
  const mounted = useMounted();
  const { user } = useAuthUser();
  const [rows, setRows] = useState<WeighRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    komoditasId: COMMODITIES[0].id,
    berat: 100,
    harga: COMMODITIES[0].basePrice,
    pasarId: MARKETS[0].id,
    petugas: "",
  });

  useEffect(() => {
    if (mounted) setRows(store.weighs.get());
  }, [mounted]);

  const refresh = () => setRows(store.weighs.get());

  const add = () => {
    const m = MARKETS.find((x) => x.id === form.pasarId)!;
    const rec: WeighRecord = {
      id: `w-${Date.now()}`,
      tanggal: new Date().toISOString(),
      komoditasId: form.komoditasId,
      berat: form.berat,
      harga: form.harga,
      pasarId: form.pasarId,
      petugas: form.petugas || user?.name || "Admin",
      foto: "",
      lokasi: m.name,
      status_supply: "incoming",
    };
    store.weighs.add(rec);
    if (user) logAudit(user, "KOMODITAS_ADD", `${rec.berat} kg ${rec.komoditasId}`);
    toast.success("Data komoditas ditambahkan");
    refresh();
    setOpen(false);
  };

  const remove = (id: string) => {
    store.weighs.remove(id);
    if (user) logAudit(user, "KOMODITAS_DELETE", id);
    refresh();
    toast("Data dihapus");
  };

  if (!mounted) return <div className="text-muted-foreground">Memuat…</div>;

  // Stats by commodity
  const stats = COMMODITIES.map((c) => {
    const data = rows.filter((r) => r.komoditasId === c.id);
    return {
      ...c,
      count: data.length,
      total: data.reduce((s, r) => s + r.berat, 0),
      avgPrice: data.length
        ? Math.round(data.reduce((s, r) => s + r.harga, 0) / data.length)
        : 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-5">
              <div className="text-3xl">{s.icon}</div>
              <div className="mt-2 text-sm font-medium">{s.name}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-2xl font-bold">{s.total.toLocaleString("id-ID")}</div>
                <div className="text-xs text-muted-foreground">kg</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {s.count} transaksi · Avg Rp {s.avgPrice.toLocaleString("id-ID")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Data Komoditas ({rows.length})</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Tambah Data
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Data Komoditas</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Komoditas</Label>
                  <Select
                    value={form.komoditasId}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        komoditasId: v,
                        harga: COMMODITIES.find((c) => c.id === v)?.basePrice ?? 0,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMODITIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Berat (kg)</Label>
                  <Input
                    type="number"
                    value={form.berat}
                    onChange={(e) => setForm({ ...form, berat: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Harga / kg</Label>
                  <Input
                    type="number"
                    value={form.harga}
                    onChange={(e) => setForm({ ...form, harga: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Pasar</Label>
                  <Select value={form.pasarId} onValueChange={(v) => setForm({ ...form, pasarId: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Petugas</Label>
                  <Input
                    value={form.petugas}
                    onChange={(e) => setForm({ ...form, petugas: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Batal
                </Button>
                <Button onClick={add}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Komoditas</TableHead>
                <TableHead>Berat</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Pasar</TableHead>
                <TableHead>Petugas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const c = COMMODITIES.find((x) => x.id === r.komoditasId);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.tanggal).toLocaleDateString("id-ID")}
                    </TableCell>
                    <TableCell>
                      {c?.icon} {c?.name}
                    </TableCell>
                    <TableCell>{r.berat} kg</TableCell>
                    <TableCell>Rp {r.harga.toLocaleString("id-ID")}</TableCell>
                    <TableCell>{r.lokasi}</TableCell>
                    <TableCell>{r.petugas}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status_supply}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4 text-deficit" />
                      </Button>
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
