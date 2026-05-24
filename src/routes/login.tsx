import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { login } from "@/lib/auth";
import { DEMO_USERS, ROLE_LABEL } from "@/lib/seed";
import { toast } from "sonner";
import { Sparkles, Wheat } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("bi@demo.id");
  const [password, setPassword] = useState("demo");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = login(email, password);
    if (!u) {
      toast.error("Email atau password salah");
      return;
    }
    toast.success(`Selamat datang, ${u.name}`);
    navigate({ to: "/dashboard" });
  };

  const quick = (em: string) => {
    setEmail(em);
    setPassword("demo");
    const u = login(em, "demo");
    if (u) {
      toast.success(`Login sebagai ${u.name}`);
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sidebar via-primary to-accent text-foreground">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_60%,white_0,transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2">
        <div className="text-sidebar-foreground">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs backdrop-blur">
            <Sparkles className="h-3 w-3" /> Smart Government · AI Analytics
          </div>
          <h1 className="text-4xl font-bold leading-tight lg:text-5xl">
            Smart Food Supply Monitoring &amp; Clustering System
          </h1>
          <p className="mt-3 text-lg text-sidebar-foreground/80">
            Monitoring distribusi pangan, AI prediksi inflasi, dan clustering surplus-defisit
            wilayah Sumatera Selatan secara real-time.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              "Integrasi Timbangan Digital",
              "K-Means Clustering Wilayah",
              "AI Prediksi Inflasi Pangan",
              "Rekomendasi Distribusi Otomatis",
            ].map((f) => (
              <div
                key={f}
                className="rounded-lg border border-white/20 bg-white/5 p-3 backdrop-blur"
              >
                <Wheat className="mb-1 h-4 w-4 text-accent" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <Card className="glass border-white/20">
          <CardHeader>
            <CardTitle className="text-2xl">Login</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pilih role atau gunakan akun demo (password: <code>demo</code>)
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg">
                Masuk
              </Button>
            </form>

            <div className="mt-6">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Quick Login (Demo)
              </div>
              <div className="grid grid-cols-1 gap-2">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    onClick={() => quick(u.email)}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <Badge variant="secondary">{ROLE_LABEL[u.role]}</Badge>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
