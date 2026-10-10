// 設定の読み込みの補い・値の検査・除外フォルダの当て方(§9.2・§10・FR-5・FR-9)。
import { describe, expect, it } from "vitest";
import { checkText, DEFAULTS, isExcluded, normalizeSettings } from "../src/settings";

describe("読み込み", () => {
	it("data.json が無ければ既定値。閾値は全部 null、記録だけ", () => {
		const r = normalizeSettings(null);
		expect(r.problem).toBe(false);
		expect(r.settings).toEqual(DEFAULTS);
		expect(r.settings.mode).toBe("record");
		expect(Object.keys(r.settings)).toHaveLength(13); // AC-16 の 13 個
	});
	it("欠けた項目と不正な値は既定値で埋める", () => {
		const r = normalizeSettings({ schemaVersion: 1, settleMs: 2000, lines: { abs: -1, ratio: 0.5 }, chars: { abs: 10, ratio: 1.5 }, recordLimit: 0 });
		expect(r.problem).toBe(false);
		expect(r.settings.settleMs).toBe(2000);
		expect(r.settings.lines).toEqual({ abs: null, ratio: 0.5 });
		expect(r.settings.chars).toEqual({ abs: 10, ratio: null });
		expect(r.settings.recordLimit).toBe(DEFAULTS.recordLimit);
	});
	it("schemaVersion が違う・読めない・形が違うときは既定値で problem", () => {
		expect(normalizeSettings({ schemaVersion: 2, mode: "alert" })).toEqual({ settings: DEFAULTS, problem: true });
		expect(normalizeSettings(null, true).problem).toBe(true);
		expect(normalizeSettings("x").problem).toBe(true);
	});
	it("閾値が1つも無いのに通知するになっていたら記録だけにする(INV-8)", () => {
		expect(normalizeSettings({ schemaVersion: 1, mode: "alert" }).settings.mode).toBe("record");
		expect(normalizeSettings({ schemaVersion: 1, mode: "alert", vanishedHeadings: 3 }).settings.mode).toBe("alert");
	});
	it("既定値の物を書き換えても DEFAULTS は変わらない", () => {
		normalizeSettings(null).settings.lines.abs = 5;
		expect(DEFAULTS.lines.abs).toBeNull();
	});
});

describe("設定画面の値の検査(§10)", () => {
	it("閾値: 空は null として通し、0 以下は弾く", () => {
		expect(checkText("abs", "")).toBeUndefined();
		expect(checkText("abs", "10")).toBeUndefined();
		expect(checkText("abs", "0")).toBe("0 より大きい数にしてください");
		expect(checkText("abs", "-3")).toBe("0 より大きい数にしてください");
		expect(checkText("abs", "abc")).toBe("0 より大きい数にしてください");
	});
	it("割合: 0 より大きく 1 以下", () => {
		expect(checkText("ratio", "1")).toBeUndefined();
		expect(checkText("ratio", "0.5")).toBeUndefined();
		expect(checkText("ratio", "0")).toBe("割合は 0 より大きく 1 以下にしてください");
		expect(checkText("ratio", "1.01")).toBe("割合は 0 より大きく 1 以下にしてください");
	});
	it("ミリ秒と件数は空を許さない", () => {
		expect(checkText("ms", "0")).toBeUndefined();
		expect(checkText("ms", "")).toBe("0 以上の整数にしてください");
		expect(checkText("ms", "1.5")).toBe("0 以上の整数にしてください");
		expect(checkText("count", "0")).toBe("1 以上の整数にしてください");
	});
});

describe("除外フォルダ(FR-5)", () => {
	it("Foo は Foo/ の配下だけに効く", () => {
		expect(isExcluded("Foo/a.md", ["Foo"])).toBe(true);
		expect(isExcluded("Foo/sub/a.md", ["Foo"])).toBe(true);
		expect(isExcluded("FooBar/a.md", ["Foo"])).toBe(false);
		expect(isExcluded("Foo.md", ["Foo"])).toBe(false);
		expect(isExcluded("a.md", [""])).toBe(false);
	});
});
