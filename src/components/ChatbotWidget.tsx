import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatbotReply } from "@/lib/ai";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { store } from "@/lib/storage";

interface Msg {
  role: "user" | "ai";
  text: string;
}

export function ChatbotWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Halo! Saya AI Asisten Pangan Sumsel 🌾. Tanya saya tentang supply, daerah surplus/defisit, harga, atau prediksi inflasi.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ctx = useMemo(() => {
    const weighs = store.weighs.get();
    const metrics = applyClusters(computeRegionMetrics(weighs));
    return { weighs, metrics };
  }, [open, msgs.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  if (!open) return null;

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setTimeout(() => {
      const reply = chatbotReply(t, ctx.metrics, ctx.weighs);
      setMsgs((m) => [...m, { role: "ai", text: reply }]);
    }, 400);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
        <Sparkles className="h-4 w-4" />
        <div className="flex-1 text-sm font-semibold">AI Asisten Pangan</div>
        <button onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Tanya AI..."
        />
        <Button onClick={send} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
