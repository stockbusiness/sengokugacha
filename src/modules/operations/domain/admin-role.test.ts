import { describe, expect, it } from "vitest";
import { resolveAdminRole } from "./admin-role";

describe("resolveAdminRole", () => {
  it("manager と明示されていれば manager", () => {
    expect(resolveAdminRole("manager")).toBe("manager");
  });

  it("operator と明示されていれば operator", () => {
    expect(resolveAdminRole("operator")).toBe("operator");
  });

  // PR-P4 の要。2ロール制の導入前に発行されたCookieには adminRole クレームが無い。
  // 以前はこれを manager として扱っていた。
  it("クレームが無い場合は operator（manager へ倒さない）", () => {
    expect(resolveAdminRole(undefined)).toBe("operator");
  });

  // 判定できないときに強い権限を与えない。
  it("未知の値・型違いはすべて operator", () => {
    for (const claim of [null, "", "admin", "MANAGER", " manager", "manager ", 1, 0, true, false, {}, []]) {
      expect(resolveAdminRole(claim), JSON.stringify(claim)).toBe("operator");
    }
  });

  // 大文字小文字を吸収しない。JWTを発行しているのは自分たちのコードなので、
  // 表記ゆれを救済する理由が無い。救済すると「managerに近い文字列」の範囲が
  // 曖昧になる。
  it("大文字小文字や前後空白を吸収しない", () => {
    expect(resolveAdminRole("Manager")).toBe("operator");
    expect(resolveAdminRole(" manager")).toBe("operator");
  });
});
