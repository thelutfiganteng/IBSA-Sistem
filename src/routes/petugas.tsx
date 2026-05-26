import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { Users, ShieldCheck, Search, Activity, Camera, UserPlus, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth";
import Webcam from "react-webcam";
import { toast } from "sonner";

interface PetugasProfile {
  id: string;
  username: string;
  full_name: string;
  role: string;
  updated_at: string;
  has_face: boolean;
}

export const Route = createFileRoute("/petugas")({
  component: PetugasDirectoryPage,
});

function PetugasDirectoryPage() {
  const { user, mounted } = useAuthUser();
  const navigate = useNavigate();
  const [petugas, setPetugas] = useState<PetugasProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<'directory' | 'register'>('directory');

  // Register Form State
  const webcamRef = useRef<Webcam>(null);
  const [formData, setFormData] = useState({ fullName: "", email: "", password: "", marketLocation: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Try to load including face_embedding
      let { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, role, updated_at, face_embedding');
      
      // 2. Fallback if face_embedding column doesn't exist in profiles table
      if (error && error.message.includes("face_embedding")) {
        console.warn("face_embedding column missing in profiles table. Falling back...");
        const fallbackRes = await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name, role, updated_at');
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        console.error("Gagal load data petugas:", error);
        toast.error(`Gagal mengambil data dari Supabase: ${error.message}`);
      }

      if (!error && data) {
        const mapped = data
          .filter(p => p.role === 'pasar' || p.role === 'staff' || p.role === 'pasar_induk')
          .map(p => ({
            id: p.id,
            username: p.username,
            full_name: p.full_name || 'Tanpa Nama',
            role: p.role,
            updated_at: p.updated_at,
            has_face: (p as any).face_embedding !== undefined && (p as any).face_embedding !== null
          }));
        setPetugas(mapped);
      }
    } catch (err) {
      console.error("Error in loadData:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && user && ['pemprov', 'bi', 'dinas'].includes(user.role)) {
      loadData();
    }
  }, [mounted, user]);

  const filtered = petugas.filter(p => 
    p.full_name.toLowerCase().includes(search.toLowerCase()) || 
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleCapture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) setCapturedImage(imageSrc);
  }, [webcamRef]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedImage) {
      toast.error("Silakan pindai wajah terlebih dahulu!");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create User using Admin API (Bypasses current session logout and email confirm)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        email_confirm: true,
        user_metadata: {
          role: 'pasar',
          full_name: formData.fullName,
        }
      });

      if (authError) throw new Error(`Gagal mendaftar auth: ${authError.message}`);
      if (!authData.user) throw new Error("Gagal membuat user Supabase.");

      const userId = authData.user.id;

      // 2. Insert Profile Data
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: userId,
        username: formData.email,
        full_name: formData.fullName,
        role: 'pasar' 
      });
      
      if (profileError) {
        console.error("Profile Error:", profileError);
        throw new Error(`Gagal menyimpan profile: ${profileError.message}`);
      }

      // 3. Register Face to Python API (if running)
      try {
        const res = await fetch(capturedImage);
        const blob = await res.blob();
        const faceForm = new FormData();
        faceForm.append("file", blob, "face.jpg");
        faceForm.append("user_id", userId);

        const apiUrl = import.meta.env.VITE_FACE_API_URL || "http://localhost:8000";
        const apiRes = await fetch(`${apiUrl}/face/register`, { method: "POST", body: faceForm });

        if (!apiRes.ok) {
           const errData = await apiRes.json();
           throw new Error(errData.detail || "Gagal mendaftarkan wajah ke sistem AI.");
        }
      } catch (faceErr) {
         console.warn("AI Backend unreachable.", faceErr);
         toast.warning("Akun berhasil dibuat & tersimpan di Supabase! Wajah belum tersimpan di AI karena Backend offline.");
      }

      toast.success("Petugas Baru Berhasil Didaftarkan!");
      setFormData({ fullName: "", email: "", password: "", marketLocation: "" });
      setCapturedImage(null);
      setView('directory');
      loadData();
      
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan saat pendaftaran.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground bg-background">
        Mengautentikasi Sesi...
      </div>
    );
  }

  // Elegant access restriction card if unauthorized role tries to access
  if (user && !['pemprov', 'bi', 'dinas'].includes(user.role)) {
    return (
      <AppShell>
        <div className="container mx-auto max-w-md px-4 py-16 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="p-4 bg-deficit/10 rounded-full border border-deficit/20 animate-pulse">
            <ShieldAlert className="h-16 w-16 text-deficit" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight text-foreground">Akses Terbatas</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Halaman ini eksklusif dan hanya dapat diakses oleh akun <b>Pemerintah Provinsi (Pemprov)</b>, <b>BI</b>, dan <b>Dinas Pangan</b>.
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
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              Manajemen Petugas Lapangan
            </h2>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
              Pantau dan daftarkan identitas biometrik petugas operasional pasar induk.
            </p>
          </div>
          
          <div className="flex items-center w-full sm:w-auto">
            {view === 'directory' ? (
              <Button onClick={() => setView('register')} className="w-full sm:w-auto shrink-0 gap-2 text-xs h-9">
                <UserPlus className="h-4 w-4" /> Daftar Petugas Baru
              </Button>
            ) : (
              <Button onClick={() => view === 'register' ? setView('directory') : null} variant="outline" className="w-full sm:w-auto shrink-0 gap-2 text-xs h-9" onClickCapture={() => setView('directory')}>
                <Users className="h-4 w-4" /> Lihat Direktori
              </Button>
            )}
          </div>
        </div>

        {view === 'directory' && (
          <>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Cari nama atau email..." 
                className="pl-9 bg-card text-xs h-9 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="grid place-items-center h-64 border rounded-xl border-dashed">
                <div className="text-muted-foreground flex flex-col items-center">
                  <Activity className="h-8 w-8 animate-pulse mb-2 text-primary" />
                  Memuat data petugas...
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="grid place-items-center h-64 border rounded-xl border-dashed">
                <div className="text-muted-foreground text-sm text-center px-4">Tidak ada petugas ditemukan di database.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((p) => (
                  <Card key={p.id} className="overflow-hidden hover:border-primary/50 transition-colors group">
                    <div className="h-24 bg-gradient-to-br from-sidebar via-primary/20 to-accent/20 relative">
                      <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-white/5" />
                      <Badge className="absolute top-3 right-3 shadow-sm text-[9px] uppercase px-1.5" variant={p.role === 'pasar' ? 'default' : 'secondary'}>
                        {p.role}
                      </Badge>
                    </div>
                    <CardContent className="pt-0 relative px-4 pb-4">
                      <div className="absolute -top-10 left-4 h-20 w-20 rounded-xl border-4 border-card bg-muted flex items-center justify-center shadow-lg overflow-hidden group-hover:scale-105 transition-transform">
                        {p.has_face ? (
                          <div className="w-full h-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Camera className="h-8 w-8" />
                          </div>
                        ) : (
                          <Users className="h-8 w-8 text-muted-foreground/50" />
                        )}
                      </div>
                      
                      <div className="mt-12">
                        <h3 className="font-bold text-base truncate text-foreground" title={p.full_name}>{p.full_name}</h3>
                        <div className="text-xs text-muted-foreground truncate font-mono">{p.username}</div>
                        
                        <div className="mt-4 pt-4 border-t border-sidebar-border/10 flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1 font-medium">
                            {p.has_face ? (
                              <><ShieldCheck className="h-4 w-4 text-emerald-500" /> <span className="text-emerald-500">Biometrik Aktif</span></>
                            ) : (
                              <><ShieldCheck className="h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground">Belum Scan</span></>
                            )}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {p.updated_at ? new Date(p.updated_at).toLocaleDateString('id-ID') : '-'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'register' && (
          <Card className="shadow-xl border-primary/20 bg-card/60 backdrop-blur-xl max-w-4xl mx-auto w-full">
            <CardHeader className="py-4 border-b border-sidebar-border/10">
              <CardTitle className="text-base sm:text-lg">Daftar Petugas Baru</CardTitle>
              <CardDescription className="text-xs">Masukkan data valid dan pindai wajah petugas.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Nama Lengkap</Label>
                    <Input required placeholder="Budi Santoso" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="text-xs h-9 bg-card/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input required type="email" placeholder="budi@pasar.sumsel.id" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="text-xs h-9 bg-card/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password</Label>
                    <Input required type="password" placeholder="Minimal 6 karakter" minLength={6} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="text-xs h-9 bg-card/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pasar Penugasan</Label>
                    <Input required placeholder="Pasar Induk Jakabaring" value={formData.marketLocation} onChange={e => setFormData({...formData, marketLocation: e.target.value})} className="text-xs h-9 bg-card/40" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Pindai Wajah Biometrik</Label>
                    <div className="overflow-hidden rounded-lg border-2 border-dashed border-primary/30 relative bg-black aspect-video flex items-center justify-center w-full">
                      {!capturedImage ? (
                        <>
                          <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover animate-pulse"
                          />
                          <Button 
                            type="button" 
                            size="sm" 
                            className="absolute bottom-3 z-10 text-xs h-8" 
                            onClick={handleCapture}
                          >
                            <Camera className="mr-1.5 h-3.5 w-3.5" /> Ambil Foto
                          </Button>
                        </>
                      ) : (
                        <>
                          <img src={capturedImage} alt="Face" className="w-full h-full object-cover" />
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="secondary"
                            className="absolute bottom-3 z-10 text-xs h-8" 
                            onClick={() => setCapturedImage(null)}
                            disabled={isSubmitting}
                          >
                            Ulangi Foto
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-2">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> 
                      Sistem mendeteksi liveness otomatis dan mengekstrak vektor wajah.
                    </p>
                  </div>

                  <Button type="submit" className="w-full text-xs h-10" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mendaftarkan Petugas...</>
                    ) : (
                      "Selesaikan Pendaftaran"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
