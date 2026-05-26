import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Role } from "@/lib/types";

export function useAuthUser(): { user: User | null; mounted: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let mountedLocal = true;

    async function fetchSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const metadata = session.user.user_metadata || {};
        const fallbackRole = metadata.role || 'pasar';
        const fallbackName = metadata.full_name || session.user.email || 'Tanpa Nama';

        // Fetch profile (might fail due to missing table/profiles RLS)
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (mountedLocal) {
          setUser({
            id: session.user.id,
            name: data?.full_name || fallbackName,
            role: (data?.role || fallbackRole) as Role,
            email: session.user.email || data?.username || '',
          });
        }
      } else {
        if (mountedLocal) setUser(null);
      }
      if (mountedLocal) setMounted(true);
    }

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (session?.user) {
        const metadata = session.user.user_metadata || {};
        const fallbackRole = metadata.role || 'pasar';
        const fallbackName = metadata.full_name || session.user.email || 'Tanpa Nama';

        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (mountedLocal) {
          setUser({
            id: session.user.id,
            name: data?.full_name || fallbackName,
            role: (data?.role || fallbackRole) as Role,
            email: session.user.email || data?.username || '',
          });
        }
      }
    });

    return () => {
      mountedLocal = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, mounted };
}
