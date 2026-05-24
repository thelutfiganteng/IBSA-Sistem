import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  suffix,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "supply" | "deficit" | "analytics" | "warning";
  suffix?: string;
}) {
  const toneClass: Record<string, string> = {
    default: "text-primary bg-primary/10",
    supply: "text-supply bg-supply/10",
    deficit: "text-deficit bg-deficit/10",
    analytics: "text-analytics bg-analytics/10",
    warning: "text-warning bg-warning/10",
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${toneClass[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-2xl font-bold">
            {value}
            {suffix && <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
