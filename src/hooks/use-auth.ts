import { useEffect, useState } from "react";
import { store } from "@/lib/storage";
import type { User } from "@/lib/types";

export function useAuthUser(): { user: User | null; mounted: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setUser(store.user.get());
    setMounted(true);
  }, []);
  return { user, mounted };
}
