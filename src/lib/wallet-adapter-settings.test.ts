import { describe, expect, it } from "vitest";
import {
  DEFAULT_WALLET_ADAPTER,
  WALLET_HTTP_ADAPTER_ALLOWED,
  resolveWalletAdapter,
} from "./wallet-adapter-settings";

describe("resolveWalletAdapter", () => {
  it("既定は fake", () => {
    expect(DEFAULT_WALLET_ADAPTER).toBe("fake");
  });

  // コード側ゲート。DBだけでは実送信へ切り替わらない。
  it("ゲートが閉じている限り、DBが http でも fake のまま", () => {
    expect(resolveWalletAdapter("http", false)).toBe("fake");
  });

  it("ゲートを開けて初めて DB の値が効く", () => {
    expect(resolveWalletAdapter("http", true)).toBe("http");
    // ゲートを開けてもDBが fake なら fake(2つ揃って初めて切り替わる)。
    expect(resolveWalletAdapter("fake", true)).toBe("fake");
  });

  // 現在の出荷状態。PR5-bでHTTPアダプタを実装し接続確認が済むまで false のまま。
  it("既定ではコード側ゲートが閉じている", () => {
    expect(WALLET_HTTP_ADAPTER_ALLOWED).toBe(false);
    expect(resolveWalletAdapter("http")).toBe("fake");
  });
});
