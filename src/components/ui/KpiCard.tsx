interface KpiCardProps {
  label: string;
  value: string;
  delta?: number; // "percent": fraction e.g. 0.12 = +12%. "absolute": raw unit difference, e.g. -0.9 positions.
  invertGood?: boolean;
  deltaFormat?: "percent" | "absolute";
}

export default function KpiCard({ label, value, delta, invertGood, deltaFormat = "percent" }: KpiCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const isGood = hasDelta ? (invertGood ? delta! < 0 : delta! > 0) : null;
  const deltaText =
    deltaFormat === "absolute"
      ? `${delta! > 0 ? "+" : ""}${delta!.toFixed(1)}`
      : `${delta! > 0 ? "+" : ""}${(delta! * 100).toFixed(1)}%`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</div>
      {hasDelta && (
        <div className={`text-xs mt-1 ${isGood ? "text-emerald-600" : "text-red-500"}`}>{deltaText} vs prior period</div>
      )}
    </div>
  );
}
