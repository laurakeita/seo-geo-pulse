"use client";

interface AnalysisSettingsBarProps {
  brandName: string;
  domain: string;
  keywordsInput: string;
  competitorsInput: string;
  useLiveData: boolean;
  onBrandNameChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onKeywordsInputChange: (v: string) => void;
  onCompetitorsInputChange: (v: string) => void;
  onUseLiveDataChange: (v: boolean) => void;
}

export default function AnalysisSettingsBar({
  brandName,
  domain,
  keywordsInput,
  competitorsInput,
  useLiveData,
  onBrandNameChange,
  onDomainChange,
  onKeywordsInputChange,
  onCompetitorsInputChange,
  onUseLiveDataChange,
}: AnalysisSettingsBarProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-gray-500 block mb-1">Brand name</label>
          <input
            value={brandName}
            onChange={(e) => onBrandNameChange(e.target.value)}
            placeholder="e.g. GlowLab Skincare"
            className="text-gray-900 placeholder:text-gray-400 w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs text-gray-500 block mb-1">Website domain</label>
          <input
            value={domain}
            onChange={(e) => onDomainChange(e.target.value)}
            placeholder="e.g. glowlabskincare.com"
            className="text-gray-900 placeholder:text-gray-400 w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="text-xs text-gray-500 block mb-1">Tracked keywords (comma separated)</label>
          <input
            value={keywordsInput}
            onChange={(e) => onKeywordsInputChange(e.target.value)}
            placeholder="e.g. niacinamide serum, hyperpigmentation"
            className="text-gray-900 placeholder:text-gray-400 w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          id="use-live-data"
          type="checkbox"
          checked={useLiveData}
          onChange={(e) => onUseLiveDataChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-indigo-600"
        />
        <label htmlFor="use-live-data" className="text-xs text-gray-600">
          Use live DataForSEO data
        </label>
      </div>

      {useLiveData && (
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">Competitors (comma separated, optional)</label>
          <input
            value={competitorsInput}
            onChange={(e) => onCompetitorsInputChange(e.target.value)}
            placeholder="e.g. The Ordinary, CeraVe"
            className="text-gray-900 placeholder:text-gray-400 w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-2">
        {useLiveData
          ? "Live mode calls the DataForSEO API (billed per request) for AI mention data and real SERP rankings. Clicks/impressions/CTR still require Google Search Console and remain demo data."
          : "Currently demo data (no live GSC/GA4/GEO tracking connected). Changes here apply instantly to every tab below."}
      </p>
    </div>
  );
}
