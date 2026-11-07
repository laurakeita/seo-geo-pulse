"use client";

import { useMemo, useState } from "react";
import OrganicPulseTab from "@/components/tabs/OrganicPulseTab";
import AITrackingTab from "@/components/tabs/AITrackingTab";
import AnalysisSettingsBar from "@/components/inputs/AnalysisSettingsBar";
import { aiVisibilityMock, organicPulseMock } from "@/lib/mock-data";

const TABS = [
  { key: "organic", label: "Organic Pulse" },
  { key: "ai", label: "AI Tracking" },
  // "report" (Opportunity Report) hidden for now — tab/file kept, just not wired into nav.
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Dashboard() {
  const [active, setActive] = useState<TabKey>("organic");
  const [brandName, setBrandName] = useState("GlowLab Skincare");
  const [domain, setDomain] = useState("glowlabskincare.com");
  const [keywordsInput, setKeywordsInput] = useState("niacinamide serum, hyperpigmentation");
  const [competitorsInput, setCompetitorsInput] = useState("The Ordinary, CeraVe");
  const [useLiveData, setUseLiveData] = useState(false);

  const focusKeywords = useMemo(
    () => keywordsInput.split(",").map((k) => k.trim()).filter(Boolean),
    [keywordsInput],
  );
  const competitors = useMemo(
    () => competitorsInput.split(",").map((c) => c.trim()).filter(Boolean),
    [competitorsInput],
  );

  return (
    <main className="min-h-screen bg-[#F7F6F3]">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-3">
          <span className="text-base font-semibold text-gray-900 tracking-tight">
            SEO<span className="text-indigo-600">/GEO</span> Pulse
          </span>
          <span className="text-xs text-gray-400 hidden sm:block">
            Organic search + AI visibility for brand clients
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 pt-5">
        <AnalysisSettingsBar
          brandName={brandName}
          domain={domain}
          keywordsInput={keywordsInput}
          competitorsInput={competitorsInput}
          useLiveData={useLiveData}
          onBrandNameChange={setBrandName}
          onDomainChange={setDomain}
          onKeywordsInputChange={setKeywordsInput}
          onCompetitorsInputChange={setCompetitorsInput}
          onUseLiveDataChange={setUseLiveData}
        />
      </div>

      <nav className="border-b border-gray-200 bg-white mt-5">
        <div className="max-w-6xl mx-auto px-5 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`text-sm px-3 py-2.5 border-b-2 transition ${
                active === tab.key
                  ? "border-indigo-600 text-indigo-600 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-5 py-6">
        {active === "organic" && (
          <OrganicPulseTab
            data={organicPulseMock}
            site={domain}
            focusKeywords={focusKeywords}
            useLiveData={useLiveData}
          />
        )}
        {active === "ai" && (
          <AITrackingTab
            data={aiVisibilityMock}
            brandName={brandName}
            useLiveData={useLiveData}
            competitors={competitors}
          />
        )}
      </div>
    </main>
  );
}
