import type { DataSource } from "@/lib/types";

export default function DataSourceBadge({ source }: { source: DataSource }) {
  if (source === "live") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
        Live data
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 text-amber-600 bg-amber-50">
      Demo data
    </span>
  );
}
