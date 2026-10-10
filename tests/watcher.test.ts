// 見張り役の流れを、偽の Host(合成のノートと cache)と偽のタイマーで確かめる。
// 実機の AC-8〜AC-14・AC-19〜AC-21 と同じ操作を、イベントを直接呼んでなぞる(実機での確かめは NOTES の手順)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheLike, Nums } from "../src/core/metrics";
import type { Detection } from "../src/core/records";
import { normalizeSettings, type Settings } from "../src/settings";
import { S } from "../src/strings";
import { Watcher } from "../src/watcher";

const P = "sg-test/test.md";

/** §11 のテスト用ノート: ### 見出し1〜10 と、それぞれの下に本文4行。空行なし。50 行 */
const NOTE = Array.from({ length: 10 }, (_, i) => [`### 見出し${i + 1}`, "本文の行1", "本文の行2", "本文の行3", "本文の行4"]).flat();

/** 行の並びから、Obsidian と同じ形の cache を作る(最後の section の end と headings) */
function cacheOf(lines: string[]): CacheLike {
	let last = lines.length - 1;
	while (last >= 0 && (lines[last] ?? "").trim() === "") last--;
	const offset = lines.slice(0, last + 1).join("\n").length;
	const headings = lines.flatMap((l) => {
		const m = /^(#{1,6}) (.+)$/.exec(l);
		return m ? [{ level: (m[1] ?? "").length, heading: m[2] ?? "" }] : [];
	});
	return { sections: last < 0 ? [] : [{ position: { end: { line: last, offset } } }], headings };
}

let files: Map<string, string[]>;
let settings: Settings;
let notices: Detection[];
let broken: string | null; // cache が例外を投げるパス

function make(open: Detection[] = [], records = { total: 0, rows: [] as never[] }): Watcher {
	return new Watcher({
		settings: () => settings,
		files: () => [...files.keys()],
		cache: (p) => {
			if (p === broken) throw new Error("boom");
			const l = files.get(p);
			return l ? cacheOf(l) : null;
		},
		notify: (d) => notices.push(d),
		dirty: () => undefined,
		platform: "desktop",
	}, records, open);
}

/** 外から書き換えて 'changed' が来た */
function write(w: Watcher, path: string, lines: string[]): void {
	files.set(path, lines);
	w.changed(path, cacheOf(lines));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("window", { setTimeout, clearTimeout }); // 偽タイマーを入れた後の物
	files = new Map([[P, NOTE], ["other.md", ["# x", "y"]]]);
	settings = normalizeSettings(null).settings;
	notices = [];
	broken = null;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("記録だけ(AC-8)", () => {
	it("閉じたまま 20 行にすると、settleMs の後に1行増え、通知は出ない", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		expect(w.records.rows).toHaveLength(0); // 待っている間は記録しない
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows).toHaveLength(1);
		expect(w.records.rows[0]).toMatchObject({
			kind: "change", path: P, before: [50, NOTE.join("\n").length, 10], after: [20, NOTE.slice(0, 20).join("\n").length, 4],
			vanished: 6, detected: false, platform: "desktop", editorRecent: false,
		});
		expect(notices).toHaveLength(0);
		expect(w.records.total).toBe(1);
	});
	it("記録だけでは控えを縮んだ側に進めるので、次の小さな編集は記録しない", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		write(w, P, [...NOTE.slice(0, 20), "足した行"]);
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows).toHaveLength(1);
		expect(w.records.total).toBe(2);
	});
	it("記録の上限を超えたら古い行から捨てる", () => {
		settings.recordLimit = 2;
		const w = make();
		w.start({});
		for (const n of [45, 40, 35]) {
			write(w, P, NOTE.slice(0, n));
			vi.advanceTimersByTime(settings.settleMs);
		}
		expect(w.records.rows.map((r) => r.after[0])).toEqual([40, 35]);
	});
});

describe("通知する(AC-9・AC-10)", () => {
	beforeEach(() => {
		settings.mode = "alert";
		settings.lines = { abs: 10, ratio: 0.5 };
	});

	it("AC-9: 通知が出て、詳細の消えた見出しは 見出し5〜10 の6つ", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		expect(notices).toHaveLength(1);
		const d = notices[0]!;
		expect(S.shrinkNotice(d.row.path, d.row.before, d.row.after, d.row.vanished)).toMatch(/^縮んだノートがあります: sg-test\/test\.md\(行 50→20/);
		expect(d.vanishedHeadings).toEqual(["### 見出し5", "### 見出し6", "### 見出し7", "### 見出し8", "### 見出し9", "### 見出し10"]);
		expect(d.row.detected).toBe(true);
		expect(w.records.rows[0]?.detected).toBe(true);
	});

	it("AC-10: 未確認の間の縮みは記録だけ。再起動の後も一覧に1行。確認したら空になり、比べると縮み 0", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		write(w, P, NOTE.slice(0, 10));
		vi.advanceTimersByTime(settings.settleMs);
		expect(notices).toHaveLength(1);
		expect(w.records.rows).toHaveLength(2);
		expect(w.records.rows[1]).toMatchObject({ before: [20, NOTE.slice(0, 20).join("\n").length, 4], after: [10, NOTE.slice(0, 10).join("\n").length, 2], detected: false });
		// 端末の控えは縮む前のまま(INV-7)
		const saved = w.collect();
		expect(saved.baseline?.[P]?.[0]).toBe(50);

		// 再起動: 端末に残した値から作り直す
		w.stop();
		const w2 = make(JSON.parse(JSON.stringify(saved.open)) as Detection[], JSON.parse(JSON.stringify(saved.records)) as never);
		w2.start(saved.baseline ?? {});
		expect(w2.detections().map((d) => d.row.path)).toEqual([P]);
		expect(w2.collect().baseline?.[P]?.[0]).toBe(50);
		expect(w2.checkNow()).toEqual({ n: 2, k: 1 }); // まだ控えより縮んだまま
		w2.confirm(P);
		expect(w2.detections()).toEqual([]);
		expect(w2.checkNow()).toEqual({ n: 2, k: 0 });
		expect(w2.collect().baseline?.[P]?.[0]).toBe(10);
	});

	it("未確認の間に行と文字が控え以上に戻ったら、自動で解除する(FR-13)", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		write(w, P, NOTE);
		expect(w.detections()).toEqual([]);
		expect(w.records.rows).toHaveLength(1);
	});

	it("閾値に当たらない減りは記録だけで、控えを進める", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 45));
		vi.advanceTimersByTime(settings.settleMs);
		expect(notices).toHaveLength(0);
		expect(w.records.rows[0]?.detected).toBe(false);
	});

	it("閾値が全部 null なら、通知するになっていても通知しない(INV-8)", () => {
		settings.lines = { abs: null, ratio: null };
		const w = make();
		w.start({});
		write(w, P, []);
		vi.advanceTimersByTime(settings.settleMs);
		expect(notices).toHaveLength(0);
		expect(w.records.rows).toHaveLength(1);
	});

	it("FR-18: 取り直すと未確認が全部消え、控えが今の状態になる", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		w.resetAll();
		expect(w.detections()).toEqual([]);
		expect(w.collect().baseline?.[P]?.[0]).toBe(20);
	});
});

describe("リネーム・途中の状態・作り直し・除外(AC-11〜AC-14)", () => {
	it("AC-11: リネームの後に 20 行にすると、新しいパスで lines_before=50", () => {
		const w = make();
		w.start({});
		const Q = "sg-test/renamed.md";
		files.delete(P);
		files.set(Q, NOTE);
		w.renamed(P, Q);
		write(w, Q, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows[0]).toMatchObject({ path: Q, before: [50, NOTE.join("\n").length, 10] });
	});

	it("AC-12: 一旦 0 バイトにし、settleMs の半分で元に戻すと記録しない", () => {
		const w = make();
		w.start({});
		write(w, P, []);
		vi.advanceTimersByTime(settings.settleMs / 2);
		write(w, P, NOTE);
		vi.advanceTimersByTime(settings.settleMs * 2);
		expect(w.records.rows).toHaveLength(0);
	});

	it("待つ間に同じファイルの 'changed' が来たら待ち直す(FR-3)", () => {
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs - 1);
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs - 1);
		expect(w.records.rows).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(w.records.rows).toHaveLength(1);
	});

	it("AC-13: 消して settleMs の半分で 20 行で作り直すと、kind=recreate の行が1つ", () => {
		const w = make();
		w.start({});
		files.delete(P);
		w.removed(P);
		vi.advanceTimersByTime(settings.settleMs / 2);
		files.set(P, NOTE.slice(0, 20));
		w.created(P);
		w.changed(P, cacheOf(NOTE.slice(0, 20)));
		vi.advanceTimersByTime(settings.settleMs * 2);
		expect(w.records.rows).toHaveLength(1);
		expect(w.records.rows[0]).toMatchObject({ kind: "recreate", before: [50, NOTE.join("\n").length, 10], after: [20, NOTE.slice(0, 20).join("\n").length, 4] });
	});

	it("AC-14: 除外フォルダの中は記録しない。除外を外すと控えを作る", () => {
		settings.excludeFolders = ["sg-test"];
		const w = make();
		w.start({});
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows).toHaveLength(0);
		expect(w.collect().baseline?.[P]).toBeUndefined();
		settings.excludeFolders = [];
		w.syncTargets();
		expect(w.collect().baseline?.[P]?.[0]).toBe(20);
	});
});

describe("起動時の比較・削除・エディタの参考(AC-19〜AC-21)", () => {
	it("AC-19: 閉じている間に 20 行になっていたら、startupDelayMs の後に kind=startup の行", () => {
		settings.startupCheck = true;
		const stored: Record<string, Nums> = { [P]: [50, NOTE.join("\n").length, 10], "other.md": [2, 5, 1] };
		files.set(P, NOTE.slice(0, 20));
		const w = make();
		w.start(stored);
		expect(w.collect().baseline).toBeNull(); // 比べ終わるまで端末の控えを書かない
		vi.advanceTimersByTime(settings.startupDelayMs);
		expect(w.records.rows).toHaveLength(1);
		expect(w.records.rows[0]).toMatchObject({ kind: "startup", before: [50, NOTE.join("\n").length, 10], after: [20, NOTE.slice(0, 20).join("\n").length, 4], vanished: 6, editorRecent: null });
		expect(w.collect().baseline?.[P]?.[0]).toBe(20);
	});

	it("起動時の比較で通知するとき、控えは縮む前の数のまま", () => {
		settings.startupCheck = true;
		settings.mode = "alert";
		settings.vanishedHeadings = 3;
		files.set(P, NOTE.slice(0, 20));
		const w = make();
		w.start({ [P]: [50, NOTE.join("\n").length, 10] });
		vi.advanceTimersByTime(settings.startupDelayMs);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.vanishedHeadings).toEqual([]);
		expect(w.collect().baseline?.[P]?.[0]).toBe(50);
	});

	it("起動の後に 'changed' で比べた物は、起動時の比較で二重に記録しない", () => {
		settings.startupCheck = true;
		const w = make();
		w.start({ [P]: [50, NOTE.join("\n").length, 10] });
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.startupDelayMs);
		expect(w.records.rows.map((r) => r.kind)).toEqual(["change"]);
	});

	it("AC-20: 消して作り直さないと kind=delete。notifyOnDelete が true のときだけ通知", () => {
		settings.mode = "alert";
		settings.vanishedHeadings = 1;
		for (const notify of [false, true]) {
			settings.notifyOnDelete = notify;
			notices = [];
			files.set(P, NOTE);
			const w = make();
			w.start({});
			files.delete(P);
			w.removed(P);
			vi.advanceTimersByTime(settings.settleMs);
			expect(w.records.rows[0]).toMatchObject({ kind: "delete", after: [0, 0, 0], vanished: 10, editorRecent: null, detected: notify });
			expect(notices).toHaveLength(notify ? 1 : 0);
			expect(S.deleteNotice(P)).toBe("ノートが消えました: sg-test/test.md。押すと詳細を開きます");
		}
	});

	it("AC-21: エディタで変更した直後の縮みは editor_recent=1、無ければ 0", () => {
		const w = make();
		w.start({});
		w.edited(P);
		vi.advanceTimersByTime(settings.editorRecentMs - 1000);
		write(w, P, NOTE.slice(0, 20));
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows[0]?.editorRecent).toBe(true);
		vi.advanceTimersByTime(settings.editorRecentMs);
		write(w, P, NOTE.slice(0, 10));
		vi.advanceTimersByTime(settings.settleMs);
		expect(w.records.rows[1]?.editorRecent).toBe(false);
	});
});

describe("1つのファイルの例外で他を止めない(INV-9)", () => {
	it("cache が例外を投げるファイルがあっても、他のファイルは比べる", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const w = make();
		w.start({});
		files.set("other.md", ["y"]);
		broken = P;
		expect(w.checkNow()).toEqual({ n: 1, k: 1 });
		expect(w.records.rows.map((r) => r.path)).toEqual(["other.md"]);
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});
});
