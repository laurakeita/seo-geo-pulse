"use client";

import { useState } from "react";
import PromptMonitorSection from "@/components/tabs/PromptMonitorSection";
import BrandVisibilityBenchmark from "@/components/tabs/BrandVisibilityBenchmark";

const TABS = [
  { key: "prompts", label: "Prompt Monitoring" },
  { key: "benchmark", label: "Brand Visibility Benchmark" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AITrackingTab({
  brandName,
  useLiveData = false,
  competitors = [],
}: {
  brandName: string;
  useLiveData?: boolean;
  competitors?: string[];
}) {
  const [tab, setTab] = useState<TabKey>("prompts");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">{brandName} — AI Tracking</h2>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-2 border-b-2 transition ${
              tab === t.key ? "border-indigo-600 text-indigo-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "prompts" && <PromptMonitorSection brandName={brandName} competitors={competitors} useLiveData={useLiveData} />}
      {tab === "benchmark" && <BrandVisibilityBenchmark brandName={brandName} competitors={competitors} useLiveData={useLiveData} />}
    </div>
  );
}
