"use client";

import type { OpportunityReportData } from "@/lib/types";

const impactStyle: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-gray-500 bg-gray-50 border-gray-200",
};

const impactLabel: Record<string, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

export default function OpportunityReportTab({
  data,
  brandName,
}: {
  data: OpportunityReportData;
  brandName?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{brandName || data.brand} — SEO/GEO Opportunity Summary</h2>
          <p className="text-xs text-gray-400 mt-0.5">Generated on: {data.generatedOn}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:border-gray-300 bg-white text-gray-600 hover:text-gray-800 transition"
        >
          Export / Print
        </button>
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <div key={item.title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${impactStyle[item.impact]}`}>
                {impactLabel[item.impact]}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">{item.insight}</p>
            <p className="text-xs text-gray-800 mt-2">
              <span className="font-medium text-indigo-600">Recommendation: </span>
              {item.recommendation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
