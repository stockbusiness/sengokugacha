"use client";

import { useEffect, useState } from "react";
import {
  describeCommissionAdminNotice,
  type CommissionAdminNotice,
  type CommissionAdminScreen,
} from "@/modules/castle/domain/commission-admin-view";

// Passport実装指示書 PR-P1b。3画面が同じ手順で停止状態を取りに行くための共通フック。
//
// 取得できるまでは notice を null にしておく。停止中なのに一瞬「通常運用」の画面
// (作成フォーム等)が見えてしまうと、押せるものと誤解させるため、判定が付くまでは
// 操作UIを出さない側に倒す。
export function useCommissionAdminNotice(screen: CommissionAdminScreen): {
  notice: CommissionAdminNotice | null;
  agencyUrl: string | null;
} {
  const [notice, setNotice] = useState<CommissionAdminNotice | null>(null);
  const [agencyUrl, setAgencyUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/commission-write-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setNotice(
          describeCommissionAdminNotice(screen, {
            landSaleCommissionWriteEnabled: Boolean(data.landSaleCommissionWriteEnabled),
            commissionRuleSetWriteEnabled: Boolean(data.commissionRuleSetWriteEnabled),
          })
        );
        setAgencyUrl(typeof data.agencyUrl === "string" ? data.agencyUrl : null);
      })
      .catch(() => {
        /* 取得できなければ notice は null のまま。操作UIは出さない側に倒れる。 */
      });

    return () => {
      cancelled = true;
    };
  }, [screen]);

  return { notice, agencyUrl };
}

// 操作UIを描画してよいか。判定が付いていない間と停止中はfalse。
export function isCommissionWriteAllowed(notice: CommissionAdminNotice | null): boolean {
  return notice?.kind === "none";
}
