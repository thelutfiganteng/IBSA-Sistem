import { supabaseAdmin } from "./supabase";

const DEMO_USERS_SEED = [
  { email: "bi@demo.id", password: "demo123", name: "Andi (BI)", role: "bi" },
  { email: "bps@demo.id", password: "demo123", name: "Rina (BPS)", role: "bps" },
  { email: "pemprov@demo.id", password: "demo123", name: "Budi (Pemprov)", role: "pemprov" },
  { email: "dinas@demo.id", password: "demo123", name: "Sari (Dinas Pangan)", role: "dinas" },
  { email: "pasar@demo.id", password: "demo123", name: "Joko (Pasar Induk)", role: "pasar" },
];

export async function seedSupabaseUsers() {
  console.log("[Seeder] Memeriksa status seed user di Supabase...");
  
  try {
    // 1. Ambil list profile yang sudah ada menggunakan supabaseAdmin (Bypass RLS)
    const { data: existingProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("username, id");
      
    if (fetchErr) {
      console.error("[Seeder] Gagal memeriksa profile di Supabase:", fetchErr);
      return;
    }
    
    const profileEmailSet = new Set(existingProfiles?.map(p => p.username) || []);
    
    // 2. Ambil list user dari Supabase Auth
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      console.error("[Seeder] Gagal melist user dari Auth Admin API:", listErr.message);
      return;
    }
    
    const authUsers = listData?.users || [];
    const authUserMap = new Map<string, string>(); // email -> id
    const authUserMetadataMap = new Map<string, any>(); // email -> user_metadata
    
    authUsers.forEach(u => {
      if (u.email) {
        authUserMap.set(u.email, u.id);
        authUserMetadataMap.set(u.email, u.user_metadata || {});
      }
    });
    
    for (const demoUser of DEMO_USERS_SEED) {
      let userId = authUserMap.get(demoUser.email);
      let metadata = authUserMetadataMap.get(demoUser.email) || {};
      
      // Jika user belum ada di Auth, daftarkan dengan user_metadata
      if (!userId) {
        console.log(`[Seeder] Mendaftarkan user Auth baru: ${demoUser.email}`);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: demoUser.email,
          password: demoUser.password,
          email_confirm: true,
          user_metadata: {
            role: demoUser.role,
            full_name: demoUser.name
          }
        });
        
        if (authErr) {
          console.error(`[Seeder] Gagal mendaftarkan Auth untuk ${demoUser.email}:`, authErr.message);
          continue;
        }
        
        if (authData.user) {
          userId = authData.user.id;
          console.log(`[Seeder] User Auth ${demoUser.email} berhasil dibuat dengan ID: ${userId}`);
        }
      } else {
        console.log(`[Seeder] User Auth ${demoUser.email} sudah ada di Auth dengan ID: ${userId}`);
        
        // Pastikan user_metadata terisi dengan role dan nama jika sebelumnya kosong
        if (!metadata.role || !metadata.full_name) {
          console.log(`[Seeder] Mengupdate user_metadata untuk ${demoUser.email}`);
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              role: demoUser.role,
              full_name: demoUser.name
            }
          });
        }
      }
      
      // Jika profile belum ada di DB, simpan menggunakan supabaseAdmin (Bypass RLS)
      if (userId && !profileEmailSet.has(demoUser.email)) {
        console.log(`[Seeder] Membuat profile baru untuk ${demoUser.email}`);
        const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
          id: userId,
          username: demoUser.email,
          full_name: demoUser.name,
          role: demoUser.role,
        });
        
        if (profileErr) {
          console.error(`[Seeder] Gagal menyimpan profile untuk ${demoUser.email}:`, profileErr.message);
        } else {
          console.log(`[Seeder] Profile untuk ${demoUser.email} berhasil disimpan.`);
        }
      } else {
        console.log(`[Seeder] Profile untuk ${demoUser.email} sudah ada.`);
      }
    }
    
    console.log("[Seeder] Proses seeding demo users selesai.");
  } catch (err) {
    console.error("[Seeder] Terjadi kesalahan saat seeding:", err);
  }
}
