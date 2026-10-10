// 変化の見張り: イベントの中身(パスと cache)を受け、除外を当て、落ち着くまで待ってから控えと比べて記録・検出する(FR-1〜FR-7・FR-13・FR-14・FR-16〜FR-18)。
// イベントの登録と画面は main.ts から Host で渡す(ここは obsidian を import しないので vitest で動かせる)。本文は読まず vault にも書かない(INV-1・INV-2)。
// 1つのファイルの処理で例外が出ても、コンソールに出して他のファイルの監視を続ける(INV-9)。
import { judge, shrank, usable, vanished } from "./core/judge";
import { EMPTY, measure, sameNums, type CacheLike, type Nums, type Snap } from "./core/metrics";
import { isoLocal, pushRow, type Detection, type Kind, type RecordsData, type Row } from "./core/records";
import { isExcluded, type Settings } from "./settings";

export interface Host {
	settings(): Settings;
	files(): string[];                     // md のパス全部
	cache(path: string): CacheLike | null; // その時点の getFileCache(無ければ null)
	notify(det: Detection): void;          // Notice を出す
	dirty(): void;                         // 端末に書く(間引いて)
	platform: "desktop" | "mobile";
}

interface OpenEntry {
	det: Detection;
	last: Snap | null; // 未確認の間の最後の状態。この後の減りはこれと比べる(FR-13)
}

export class Watcher {
	private base = new Map<string, Snap>();                                  // 控え(メモリ。D-10)
	private open = new Map<string, OpenEntry>();                             // 未確認の検出
	private pending = new Map<string, { timer: number; editor: boolean }>(); // 落ち着くまで待つ(FR-3)
	private deleted = new Map<string, { snap: Snap; timer: number }>();      // 削除直後(FR-4)
	private recreated = new Set<string>();
	private editorAt = new Map<string, number>();
	private compared = new Set<string>(); // 起動時の比較の前に 'changed' で比べた物(二重に記録しない)
	private startupTimer: number | null = null;
	private locked = false;               // 起動時の比較が終わるまで端末の baseline を書かない(FR-14)

	constructor(private host: Host, readonly records: RecordsData, open: Detection[]) {
		for (const det of open) this.open.set(det.row.path, { det, last: null });
	}

	/** onLayoutReady から。控えを作り(FR-1)、起動時の比較を仕掛ける(FR-14) */
	start(stored: Record<string, Nums>): void {
		this.syncTargets();
		const s = this.host.settings();
		if (s.startupCheck) {
			this.locked = true;
			this.startupTimer = window.setTimeout(() => this.startupCheck(stored), s.startupDelayMs);
		}
	}

	stop(): void {
		for (const p of this.pending.values()) window.clearTimeout(p.timer);
		for (const d of this.deleted.values()) window.clearTimeout(d.timer);
		if (this.startupTimer !== null) window.clearTimeout(this.startupTimer);
		this.pending.clear();
		this.deleted.clear();
		this.startupTimer = null;
	}

	private isTarget(path: string): boolean {
		return path.endsWith(".md") && !isExcluded(path, this.host.settings().excludeFolders);
	}

	private alerting(): boolean {
		const s = this.host.settings();
		return s.mode === "alert" && usable(s); // INV-8
	}

	private safe(path: string, fn: () => void): void {
		try {
			fn();
		} catch (e) {
			console.error(`[sync-guard] ${path}`, e);
		}
	}

	/** 除外の外の md に控えを作り、除外に入った物の控えを捨てる(FR-1・FR-5・§10) */
	syncTargets(): void {
		for (const p of [...this.base.keys()]) if (!this.isTarget(p)) this.base.delete(p);
		for (const path of this.host.files()) {
			if (!this.isTarget(path)) continue;
			const o = this.open.get(path);
			if (o ? o.last : this.base.has(path)) continue;
			this.safe(path, () => {
				const c = this.host.cache(path);
				if (!c) return; // cache が無い物は最初の 'changed' を控えにする
				if (o) o.last = measure(c);
				else this.base.set(path, measure(c));
			});
		}
		this.host.dirty();
	}

	// ── イベント ──

	changed(path: string, cache: CacheLike): void {
		if (!this.isTarget(path)) return;
		this.safe(path, () => {
			const now = measure(cache);
			const o = this.open.get(path);
			const ref = o ? o.last : this.base.get(path);
			if (!ref) {
				if (o) o.last = now;
				else this.base.set(path, now);
				this.host.dirty();
				return;
			}
			this.records.total++;
			this.compared.add(path);
			const p = this.pending.get(path);
			if (p || shrank(ref.nums, now.nums, vanished(ref.headings, now.headings).length)) {
				this.schedule(path, this.editorRecent(path) || (p?.editor ?? false));
			} else {
				this.accept(path, now);
			}
		});
	}

	renamed(oldPath: string, path: string): void {
		this.safe(path, () => {
			const v = this.base.get(oldPath);
			this.base.delete(oldPath);
			if (v && this.isTarget(path)) this.base.set(path, v);
			const t = this.editorAt.get(oldPath);
			if (t !== undefined) this.editorAt.set(path, t);
			const o = this.open.get(oldPath);
			if (o) {
				this.open.delete(oldPath);
				o.det.row.path = path;
				this.open.set(path, o);
			}
			if (this.recreated.delete(oldPath)) this.recreated.add(path);
			const p = this.pending.get(oldPath);
			if (p) {
				window.clearTimeout(p.timer);
				this.pending.delete(oldPath);
				this.schedule(path, p.editor);
			}
			if (this.isTarget(path) && !v && !o) {
				const c = this.host.cache(path);
				if (c) this.base.set(path, measure(c));
			}
			this.host.dirty();
		});
	}

	removed(path: string): void {
		if (!this.isTarget(path)) return;
		this.safe(path, () => {
			const p = this.pending.get(path);
			if (p) window.clearTimeout(p.timer);
			this.pending.delete(path);
			const o = this.open.get(path);
			const snap = o ? o.last : this.base.get(path);
			this.base.delete(path);
			if (!snap) return;
			const timer = window.setTimeout(() => this.safe(path, () => this.finishDelete(path)), this.host.settings().settleMs);
			this.deleted.set(path, { snap, timer });
		});
	}

	created(path: string): void {
		const d = this.deleted.get(path);
		if (!d) return;
		window.clearTimeout(d.timer);
		this.deleted.delete(path);
		const o = this.open.get(path);
		if (o) o.last = d.snap;
		else this.base.set(path, d.snap);
		this.recreated.add(path); // 次の比べで減りがあれば種類 recreate
	}

	edited(path: string): void {
		this.editorAt.set(path, Date.now());
	}

	// ── 比べる ──

	private editorRecent(path: string): boolean {
		const t = this.editorAt.get(path);
		return t !== undefined && Date.now() - t <= this.host.settings().editorRecentMs;
	}

	private schedule(path: string, editor: boolean): void {
		const p = this.pending.get(path);
		if (p) window.clearTimeout(p.timer);
		const timer = window.setTimeout(() => this.safe(path, () => this.settle(path)), this.host.settings().settleMs);
		this.pending.set(path, { timer, editor });
	}

	private settle(path: string): void {
		const p = this.pending.get(path);
		this.pending.delete(path);
		if (!this.isTarget(path)) return;
		const c = this.host.cache(path);
		if (c) this.evaluate(path, measure(c), p?.editor ?? false);
	}

	/** 減りが無ければ控えを進める。あれば記録し、判定に当たれば検出にする。減りがあったら true */
	private evaluate(path: string, now: Snap, editor: boolean): boolean {
		const o = this.open.get(path);
		const ref = o ? o.last : this.base.get(path);
		if (!ref) {
			if (o) o.last = now;
			else this.base.set(path, now);
			this.host.dirty();
			return false;
		}
		const v = vanished(ref.headings, now.headings);
		if (!shrank(ref.nums, now.nums, v.length)) {
			this.accept(path, now);
			return false;
		}
		const kind: Kind = this.recreated.delete(path) ? "recreate" : "change";
		const hit = !o && this.alerting() && judge(ref.nums, now.nums, v.length, this.host.settings());
		const row = this.row(kind, path, ref.nums, now.nums, v.length, editor, hit);
		this.record(row);
		if (o) o.last = now;                    // 未確認の間: 記録だけ。通知しない(FR-13)
		else if (hit) this.detect(row, v, now); // 控えは縮む前のまま(INV-7・D-11)
		else this.base.set(path, now);
		return true;
	}

	/** 減りの無い変化: 控えを進める。未確認なら、行と文字が控え以上に戻ったら解除する(FR-13) */
	private accept(path: string, now: Snap): void {
		this.recreated.delete(path);
		const o = this.open.get(path);
		if (o) {
			o.last = now;
			const b = o.det.row.before;
			if (now.nums[0] >= b[0] && now.nums[1] >= b[1]) {
				this.open.delete(path);
				this.base.set(path, now);
			}
		} else {
			this.base.set(path, now);
		}
		this.host.dirty();
	}

	private finishDelete(path: string): void {
		const d = this.deleted.get(path);
		if (!d) return;
		this.deleted.delete(path);
		const o = this.open.get(path);
		const b = d.snap.nums;
		const hit = !o && this.alerting() && this.host.settings().notifyOnDelete;
		this.records.total++;
		const row = this.row("delete", path, b, [0, 0, 0], b[2], null, hit);
		this.record(row);
		if (o) o.last = EMPTY;
		else if (hit) this.detect(row, [], EMPTY);
	}

	private startupCheck(stored: Record<string, Nums>): void {
		this.startupTimer = null;
		for (const path of this.host.files()) {
			if (!this.isTarget(path) || this.open.has(path) || this.compared.has(path)) continue;
			const prev = stored[path];
			if (!prev) continue;
			this.safe(path, () => {
				const c = this.host.cache(path);
				if (!c) return;
				const now = measure(c);
				if (sameNums(prev, now.nums)) return;
				this.records.total++;
				const lostH = Math.max(0, prev[2] - now.nums[2]); // 見出しは数の減りで見る
				if (!shrank(prev, now.nums, lostH)) return;
				const hit = this.alerting() && judge(prev, now.nums, lostH, this.host.settings());
				const row = this.row("startup", path, prev, now.nums, lostH, null, hit);
				this.record(row);
				if (hit) this.detect(row, [], now);
			});
		}
		this.locked = false;
		this.host.dirty();
	}

	private row(kind: Kind, path: string, before: Nums, after: Nums, v: number, editor: boolean | null, detected: boolean): Row {
		return {
			at: isoLocal(new Date()), kind, path,
			before: [before[0], before[1], before[2]], after: [after[0], after[1], after[2]],
			vanished: v, editorRecent: editor, platform: this.host.platform, detected,
		};
	}

	private record(row: Row): void {
		pushRow(this.records, row, this.host.settings().recordLimit);
		this.host.dirty();
	}

	private detect(row: Row, vanishedHeadings: string[], last: Snap): void {
		const det: Detection = { row: { ...row }, vanishedHeadings };
		this.open.set(row.path, { det, last });
		this.host.notify(det);
	}

	// ── コマンド・画面から ──

	/** FR-17。縮みの数は、今回減りがあった物と、まだ控えより縮んだままの未確認の物 */
	checkNow(): { n: number; k: number } {
		let n = 0;
		let k = 0;
		for (const path of this.host.files()) {
			if (!this.isTarget(path)) continue;
			this.safe(path, () => {
				const c = this.host.cache(path);
				if (!c) return;
				n++;
				const p = this.pending.get(path);
				if (p) window.clearTimeout(p.timer);
				this.pending.delete(path);
				const s = this.evaluate(path, measure(c), this.editorRecent(path) || (p?.editor ?? false));
				if (s || this.open.has(path)) k++;
			});
		}
		return { n, k };
	}

	/** 「確認した」: 今の状態を控えにする(FR-12・FR-13) */
	confirm(path: string): void {
		this.open.delete(path);
		const c = this.isTarget(path) ? this.host.cache(path) : null;
		if (c) this.base.set(path, measure(c));
		this.host.dirty();
	}

	/** FR-18: 全部の控えを今の状態にし、未確認を全部確認済みにする */
	resetAll(): void {
		for (const p of this.pending.values()) window.clearTimeout(p.timer);
		this.pending.clear();
		if (this.startupTimer !== null) window.clearTimeout(this.startupTimer);
		this.startupTimer = null;
		this.locked = false;
		this.open.clear();
		this.base.clear();
		this.recreated.clear();
		this.syncTargets();
	}

	detections(): Detection[] {
		return [...this.open.values()].map((o) => o.det);
	}

	isOpen(path: string): boolean {
		return this.open.has(path);
	}

	/** 端末に書く値(§9.3)。未確認のファイルの控えは縮む前の数(INV-7) */
	collect(): { baseline: Record<string, Nums> | null; records: RecordsData; open: Detection[] } {
		let baseline: Record<string, Nums> | null = null;
		if (!this.locked) {
			baseline = {};
			for (const [p, s] of this.base) baseline[p] = s.nums;
			for (const [p, o] of this.open) baseline[p] = o.det.row.before;
		}
		return { baseline, records: this.records, open: this.detections() };
	}
}
