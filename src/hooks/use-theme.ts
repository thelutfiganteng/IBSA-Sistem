import { useEffect, useState } from "react";
import { store } from "@/lib/storage";

export function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  useEffect(() => {
    const t = store.theme.get();
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);
  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    store.theme.set(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggle };
}
