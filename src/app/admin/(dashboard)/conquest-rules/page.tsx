"use client";

import { useEffect, useMemo, useState } from "react";

type Warlord = {
  id: string;
  name: string;
  slot_type: "common" | "mid" | "rare";
  province_id: string;
  provinces: { id: string; name: string; display_order: number | null } | null;
};

type ConquestRule = {
  id: string;
  provinceId: string;
  ruleType: "all_specified";
  isActive: boolean;
  warlordIds: string[];
};

type ProvinceGroup = {
  provinceId: string;
  provinceName: string;
  displayOrder: number;
  warlords: Warlord[];
};

const SLOT_LABEL: Record<Warlord["slot_type"], string> = {
  common: "足軽級",
  mid: "中堅級",
  rare: "大名級",
};

export default function ConquestRulesPage() {
  const [warlords, setWarlords] = useState<Warlord[]>([]);
  const [rules, setRules] = useState<Record<string, ConquestRule>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selection, setSelection] = useState<Record<string, { isActive: boolean; requiredWarlordIds: string[] }>>({});
  const [savingProvinceId, setSavingProvinceId] = useState<string | null>(null);
  const [messageByProvinceId, setMessageByProvinceId] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/warlords").then((res) => res.json()),
      fetch("/api/admin/conquest-rules").then((res) => res.json()),
    ])
      .then(([warlordData, ruleData]: [Warlord[], ConquestRule[]]) => {
        setWarlords(warlordData);
        const ruleMap: Record<string, ConquestRule> = {};
        const selectionInit: Record<string, { isActive: boolean; requiredWarlordIds: string[] }> = {};
        for (const rule of ruleData) {
          ruleMap[rule.provinceId] = rule;
          selectionInit[rule.provinceId] = { isActive: rule.isActive, requiredWarlordIds: rule.warlordIds };
        }
        setRules(ruleMap);
        setSelection(selectionInit);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const groups = useMemo<ProvinceGroup[]>(() => {
    const byProvince = new Map<string, ProvinceGroup>();
    for (const w of warlords) {
      if (!w.provinces) continue;
      const existing = byProvince.get(w.province_id);
      if (existing) {
        existing.warlords.push(w);
      } else {
        byProvince.set(w.province_id, {
          provinceId: w.province_id,
          provinceName: w.provinces.name,
          displayOrder: w.provinces.display_order ?? 9999,
          warlords: [w],
        });
      }
    }
    return Array.from(byProvince.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [warlords]);

  function currentSelection(provinceId: string, group: ProvinceGroup) {
    return (
      selection[provinceId] ?? {
        isActive: false,
        requiredWarlordIds: group.warlords.map((w) => w.id),
      }
    );
  }

  function toggleWarlord(provinceId: string, group: ProvinceGroup, warlordId: string) {
    setSelection((prev) => {
      const current = prev[provinceId] ?? currentSelection(provinceId, group);
      const has = current.requiredWarlordIds.includes(warlordId);
      const requiredWarlordIds = has
        ? current.requiredWarlordIds.filter((id) => id !== warlordId)
        : [...current.requiredWarlordIds, warlordId];
      return { ...prev, [provinceId]: { ...current, requiredWarlordIds } };
    });
  }

  function toggleActive(provinceId: string, group: ProvinceGroup) {
    setSelection((prev) => {
      const current = prev[provinceId] ?? currentSelection(provinceId, group);
      return { ...prev, [provinceId]: { ...current, isActive: !current.isActive } };
    });
  }

  async function handleSave(provinceId: string, group: ProvinceGroup) {
    const current = currentSelection(provinceId, group);
    setSavingProvinceId(provinceId);
    setMessageByProvinceId((prev) => ({ ...prev, [provinceId]: "" }));

    try {
      const res = await fetch(`/api/admin/conquest-rules/${provinceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setRules((prev) => ({
        ...prev,
        [provinceId]: {
          id: prev[provinceId]?.id ?? provinceId,
          provinceId,
          ruleType: "all_specified",
          isActive: current.isActive,
          warlordIds: current.requiredWarlordIds,
        },
      }));
      setMessageByProvinceId((prev) => ({ ...prev, [provinceId]: "保存しました" }));
    } catch (error) {
      setMessageByProvinceId((prev) => ({
        ...prev,
        [provinceId]: error instanceof Error ? error.message : "保存に失敗しました",
      }));
    } finally {
      setSavingProvinceId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">国制覇条件</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          国ごとに、制覇に必要な武将を個別設定できます。「有効にする」がOFFの国は、従来通り
          「その国の武将を全部所持」で自動判定されます(初期状態)。条件を変更しても、既に制覇済みの
          ユーザーの実績は取り消されません。
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const current = currentSelection(group.provinceId, group);
          const savedRule = rules[group.provinceId];
          return (
            <div
              key={group.provinceId}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{group.provinceName}</h2>
                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={current.isActive}
                    onChange={() => toggleActive(group.provinceId, group)}
                  />
                  独自条件を有効にする
                  {savedRule?.isActive && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      設定済み
                    </span>
                  )}
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {group.warlords.map((w) => (
                  <label key={w.id} className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={current.requiredWarlordIds.includes(w.id)}
                      onChange={() => toggleWarlord(group.provinceId, group, w.id)}
                    />
                    {w.name}
                    <span className="text-xs text-zinc-400">({SLOT_LABEL[w.slot_type]})</span>
                  </label>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleSave(group.provinceId, group)}
                  disabled={savingProvinceId === group.provinceId}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {savingProvinceId === group.provinceId ? "保存中..." : "保存"}
                </button>
                {messageByProvinceId[group.provinceId] && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {messageByProvinceId[group.provinceId]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
