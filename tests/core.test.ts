// core の純関数(数え方・比べ方・判定・記録・TSV)を合成の cache で確かめる(AC-2 の (a)〜(f))。
import { describe, expect, it } from "vitest";
import { judge, shrank, usable, vanished, type Thresholds } from "../src/core/judge";
import { measure, type Nums } from "../src/core/metrics";
import { deadline, isoLocal, laterCount, parseBaseline, parseOpen, parseRecords, pushRow, type Row } from "../src/core/records";
import { toTsv } from "../src/core/tsv";

const sec = (line: number, offset: number) => ({ position: { end: { line, offset } } });
const NONE: Thresholds = { lines: { abs: null, ratio: null }, chars: { abs: null, ratio: null }, vanishedHeadings: null };

describe("(a) 数え方", () => {
	it("L は最後の section の end.line + 1、C はその offset、H は # × level + 空白 + 見出し", () => {
		const s = measure({
			sections: [sec(0, 10), sec(5, 80), sec(49, 812)],
			headings: [{ level: 1, heading: "題" }, { level: 3, heading: "見出し1" }],
		});
		expect(s.nums).toEqual([50, 812, 2]);
		expect(s.headings).toEqual(["# 題", "### 見出し1"]);
	});
	it("sections も headings も無ければ 0", () => {
		expect(measure({}).nums).toEqual([0, 0, 0]);
		expect(measure({ sections: [] }).headings).toEqual([]);
	});
});

describe("(b) 消えた見出し", () => {
	it("多重集合として引き、前の順に並べる", () => {
		expect(vanished(["### A", "### A", "### B"], ["### A"])).toEqual(["### A", "### B"]);
	});
	it("1つ消して1つ足した書き直しでも、消えた方が出る", () => {
		expect(vanished(["## X", "## Y"], ["## X", "## Z"])).toEqual(["## Y"]);
	});
	it("減りの有無", () => {
		expect(shrank([10, 100, 1], [10, 100, 1], 0)).toBe(false);
		expect(shrank([10, 100, 1], [12, 99, 1], 0)).toBe(true);
		expect(shrank([10, 100, 1], [12, 120, 1], 1)).toBe(true);
	});
});

describe("(c) 閾値ちょうどは検出、1 少ないと検出でない", () => {
	it("行", () => {
		const t: Thresholds = { ...NONE, lines: { abs: 10, ratio: 0.2 } };
		expect(judge([50, 0, 0], [40, 0, 0], 0, t)).toBe(true);  // 10 行・0.2
		expect(judge([50, 0, 0], [41, 0, 0], 0, t)).toBe(false); // 9 行
		const r: Thresholds = { ...NONE, lines: { abs: 1, ratio: 0.3 } };
		expect(judge([30, 0, 0], [21, 0, 0], 0, r)).toBe(true);  // 9/30 = 0.3
		expect(judge([30, 0, 0], [22, 0, 0], 0, r)).toBe(false); // 8/30
	});
	it("文字", () => {
		const t: Thresholds = { ...NONE, chars: { abs: 1000, ratio: 0.1 } };
		expect(judge([0, 10000, 0], [0, 9000, 0], 0, t)).toBe(true);
		expect(judge([0, 10000, 0], [0, 9001, 0], 0, t)).toBe(false);
	});
	it("見出し", () => {
		const t: Thresholds = { ...NONE, vanishedHeadings: 3 };
		expect(judge([0, 0, 5], [0, 0, 5], 3, t)).toBe(true);
		expect(judge([0, 0, 5], [0, 0, 5], 2, t)).toBe(false);
	});
	it("量と割合の片方が null の項目は使わない", () => {
		const t: Thresholds = { ...NONE, lines: { abs: 1, ratio: null } };
		expect(judge([50, 0, 0], [0, 0, 0], 0, t)).toBe(false);
		expect(usable(t)).toBe(false);
		expect(usable({ ...NONE, vanishedHeadings: 1 })).toBe(true);
	});
});

describe("(d)(e) 当たらない場合", () => {
	it("(d) 閾値が全部 null なら、どんな減りも検出でない(INV-8)", () => {
		expect(judge([1000, 100000, 50], [0, 0, 0], 50, NONE)).toBe(false);
		expect(usable(NONE)).toBe(false);
	});
	it("(e) 前の L が 0 なら行の項目は当たらない", () => {
		const t: Thresholds = { ...NONE, lines: { abs: 1, ratio: 0.01 } };
		expect(judge([0, 0, 0], [0, 0, 0], 0, t)).toBe(false);
	});
});

const row = (over: Partial<Row> = {}): Row => ({
	at: "2026-09-25T18:35:00+09:00", kind: "change", path: "a.md", before: [50, 800, 10], after: [20, 300, 4],
	vanished: 6, editorRecent: false, platform: "desktop", detected: false, ...over,
});

describe("(f) TSV", () => {
	it("1行目は列名、パスのタブと改行は空白1つ", () => {
		const t = toTsv([row({ path: "a\tb\nc\r\nd.md", editorRecent: null, detected: true })]).split("\n");
		expect(t[0]).toBe("at\tkind\tpath\tlines_before\tlines_after\tchars_before\tchars_after\theadings_before\theadings_after\tvanished\teditor_recent\tplatform\tdetected");
		expect(t[1]).toBe("2026-09-25T18:35:00+09:00\tchange\ta b c d.md\t50\t20\t800\t300\t10\t4\t6\t\tdesktop\t1");
		expect(toTsv([row({ editorRecent: true })]).split("\n")[1]?.split("\t")[10]).toBe("1");
		expect(toTsv([row()]).split("\n")[1]?.split("\t")[10]).toBe("0");
	});
});

describe("記録", () => {
	it("上限を超えたら古い行から捨てる(FR-6)", () => {
		const d = { total: 0, rows: [] as Row[] };
		for (const p of ["1", "2", "3"]) pushRow(d, row({ path: p }), 2);
		expect(d.rows.map((r) => r.path)).toEqual(["2", "3"]);
	});
	it("時刻は現地時刻で UTC からの差つき、期限は日数を足す", () => {
		expect(isoLocal(new Date(2026, 8, 25, 18, 5, 9))).toMatch(/^2026-09-25T18:05:09[+-]\d\d:\d\d$/);
		const at = isoLocal(new Date(2026, 8, 25, 18, 5, 9));
		expect(deadline(at, 7)).toBe("2026-10-02 18:05");
	});
	it("その後に縮んだ回数", () => {
		const det = { row: row(), vanishedHeadings: [] };
		const rows = [row(), row({ at: "2026-09-25T19:00:00+09:00" }), row({ at: "2026-09-25T19:00:00+09:00", path: "b.md" })];
		expect(laterCount(rows, det)).toBe(1);
	});
	it("端末から読んだ値の形を確かめ、合わない物は捨てる", () => {
		expect(parseBaseline({ "a.md": [1, 2, 3], "b.md": [1, 2], "c.md": "x" })).toEqual({ "a.md": [1, 2, 3] as Nums });
		expect(parseBaseline(null)).toEqual({});
		expect(parseRecords({ total: 5, rows: [row(), { at: 1 }] })).toEqual({ total: 5, rows: [row()] });
		expect(parseRecords("broken")).toEqual({ total: 0, rows: [] });
		expect(parseOpen([{ row: row(), vanishedHeadings: ["### A"] }, { row: row(), vanishedHeadings: [1] }, null])).toHaveLength(1);
		expect(parseOpen({})).toEqual([]);
	});
});
