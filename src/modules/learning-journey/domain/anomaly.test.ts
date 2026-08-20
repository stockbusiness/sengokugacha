import { describe, expect, it } from "vitest";
import { DEFAULT_ANOMALY_THRESHOLDS, describeAnomaly, detectAnomalies } from "./anomaly";

function at(minutes: number) {
  return new Date(Date.UTC(2026, 7, 20, 12, minutes, 0)).toISOString();
}

describe("detectAnomalies", () => {
  it("完了が無ければ何も出さない", () => {
    expect(detectAnomalies({ completions: [], freeTexts: [] })).toEqual([]);
  });

  it("ゆっくり進めていれば疑いを出さない", () => {
    const completions = [
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(30) },
      { missionId: "m3", completedAt: at(60) },
    ];
    expect(detectAnomalies({ completions, freeTexts: [] })).toEqual([]);
  });

  it("5分以内に3件完了していれば疑いを出す", () => {
    const completions = [
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(2) },
      { missionId: "m3", completedAt: at(4) },
    ];
    expect(detectAnomalies({ completions, freeTexts: [] })).toEqual([
      { kind: "rapid_completion", completedCount: 3, withinMinutes: 5 },
    ]);
  });

  it("窓の外に散っていれば疑いを出さない", () => {
    const completions = [
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(4) },
      { missionId: "m3", completedAt: at(20) },
    ];
    expect(detectAnomalies({ completions, freeTexts: [] })).toEqual([]);
  });

  it("順不同で渡されても正しく数える", () => {
    const completions = [
      { missionId: "m3", completedAt: at(4) },
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(2) },
    ];
    expect(detectAnomalies({ completions, freeTexts: [] })[0]).toMatchObject({ kind: "rapid_completion" });
  });

  it("不正な日付は無視する", () => {
    const completions = [
      { missionId: "m1", completedAt: "not-a-date" },
      { missionId: "m2", completedAt: at(0) },
    ];
    expect(detectAnomalies({ completions, freeTexts: [] })).toEqual([]);
  });

  it("同じ自由記述が3件あれば疑いを出す", () => {
    const freeTexts = ["よかった", "よかった", "よかった", "たのしかった"];
    expect(detectAnomalies({ completions: [], freeTexts })).toEqual([
      { kind: "identical_free_text", occurrences: 3 },
    ]);
  });

  it("前後の空白は同じ文とみなす", () => {
    const freeTexts = ["よかった", " よかった ", "よかった\n"];
    expect(detectAnomalies({ completions: [], freeTexts })[0]).toMatchObject({ kind: "identical_free_text" });
  });

  // 空欄は「使い回し」ではない。無回答が並んだだけで疑いを出さないこと。
  it("空欄が並んでも疑いを出さない", () => {
    expect(detectAnomalies({ completions: [], freeTexts: ["", "  ", "\n", ""] })).toEqual([]);
  });

  it("複数の疑いを同時に出せる", () => {
    const completions = [
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(1) },
      { missionId: "m3", completedAt: at(2) },
    ];
    const signals = detectAnomalies({ completions, freeTexts: ["a", "a", "a"] });
    expect(signals.map((s) => s.kind)).toEqual(["rapid_completion", "identical_free_text"]);
  });

  it("しきい値を変えられる", () => {
    const completions = [
      { missionId: "m1", completedAt: at(0) },
      { missionId: "m2", completedAt: at(1) },
    ];
    expect(
      detectAnomalies({ completions, freeTexts: [] }, { ...DEFAULT_ANOMALY_THRESHOLDS, rapidCompletionCount: 2 })
    ).toHaveLength(1);
  });
});

describe("describeAnomaly", () => {
  // 「不正」と断定しない文言であることを固定する(指示書§11「単一条件で不正と断定しない」)。
  it("確認を促す表現にする", () => {
    expect(describeAnomaly({ kind: "rapid_completion", completedCount: 3, withinMinutes: 5 })).toBe(
      "5分間に3件完了（要確認）"
    );
    expect(describeAnomaly({ kind: "identical_free_text", occurrences: 4 })).toBe("同じ自由記述が4件（要確認）");
  });

  it("断定的な語を含まない", () => {
    const texts = [
      describeAnomaly({ kind: "rapid_completion", completedCount: 9, withinMinutes: 5 }),
      describeAnomaly({ kind: "identical_free_text", occurrences: 9 }),
    ];
    for (const text of texts) {
      expect(text).not.toContain("不正");
      expect(text).toContain("要確認");
    }
  });
});
