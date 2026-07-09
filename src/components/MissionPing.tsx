"use client";

import { useEffect } from "react";

// 「本日の任務」のうち、ログからは自動判定できないもの(画面を見た、リンクを開いた等)を
// 簡易的に達成扱いにするための無表示コンポーネント。未ログイン等でpingが失敗しても
// 画面表示には一切影響させない。
export function MissionPing({ missionKey }: { missionKey: string }) {
  useEffect(() => {
    fetch("/api/missions/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: missionKey }),
    }).catch(() => {
      /* 任務達成表示はおまけ機能のため、失敗しても無視する */
    });
  }, [missionKey]);

  return null;
}
