import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { DEMO_USERS, ROLE_LABEL } from "@/lib/seed";
import { toast } from "sonner";
import { Sparkles, Wheat, Camera, Loader2 } from "lucide-react";
import Webcam from "react-webcam";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("bi@demo.id");
  const [password, setPassword] = useState("demo123");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      
      toast.success("Login berhasil!");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Email atau password salah");
    } finally {
      setIsSubmitting(false);
    }
  };

  const quick = async (em: string) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: em,
        password: "demo123",
      });
      if (error) throw error;
      toast.success(`Login berhasil sebagai ${em}`);
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Gagal quick login");
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordlessLogin = async (em: string) => {
    setIsSubmitting(true);
    try {
      console.log(`[Biometrik] Menghasilkan token login untuk: ${em}`);
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: em,
      });
      if (linkError) throw linkError;

      if (linkData?.properties?.email_otp) {
        console.log(`[Biometrik] Memverifikasi token OTP...`);
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: em,
          token: linkData.properties.email_otp,
          type: 'magiclink',
        });
        if (verifyError) throw verifyError;
        
        toast.success(`Login biometrik sukses! Selamat datang.`);
        navigate({ to: "/dashboard" });
      } else {
        throw new Error("Token biometrik tidak dapat di-generate.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal masuk lewat biometrik");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [useFace, setUseFace] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  const captureFace = useCallback(async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setVerifyingFace(true);
    try {
      // Convert base64 to blob
      const res = await fetch(imageSrc);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append("file", blob, "face.jpg");

      const apiUrl = import.meta.env.VITE_FACE_API_URL || "http://localhost:8000";
      const apiRes = await fetch(`${apiUrl}/face/verify`, {
        method: "POST",
        body: formData,
      });

      const data = await apiRes.json();
      if (!apiRes.ok) {
        throw new Error(data.detail || "Wajah tidak dikenali");
      }

      // If matched, we log them in passwordlessly via admin generated magiclink
      if (data.user && data.user.username) {
        toast.success(`Wajah Cocok: ${data.user.full_name}`);
        await passwordlessLogin(data.user.username);
      } else {
        toast.error("Wajah cocok tetapi data pengguna tidak lengkap.");
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal memverifikasi wajah");
    } finally {
      setVerifyingFace(false);
    }
  }, [webcamRef]);

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
              Pilih role atau gunakan akun demo (password: <code>demo123</code>)
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

            <div className="mt-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <div className="text-xs text-muted-foreground uppercase">ATAU</div>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="mt-4">
              {!useFace ? (
                <Button variant="outline" className="w-full" onClick={() => setUseFace(true)}>
                  <Camera className="mr-2 h-4 w-4" /> Login dengan Wajah (Biometrik)
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="overflow-hidden rounded-md bg-black relative">
                    <Webcam
                      ref={webcamRef}
                      audio={false}
                      screenshotFormat="image/jpeg"
                      className="w-full h-[200px] object-cover"
                    />
                    {verifyingFace && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-sm mt-2 font-medium">Memverifikasi AI...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" 
                      onClick={captureFace}
                      disabled={verifyingFace}
                    >
                      Pindai Wajah
                    </Button>
                    <Button variant="outline" onClick={() => setUseFace(false)} disabled={verifyingFace}>
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>

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
