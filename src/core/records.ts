// 記録の行・未確認の検出の形(§9.3)と、行を足して上限で切る・端末から読んだ値を確かめる処理。obsidian を import しない純関数。
// 端末から読んだ値は形を確かめ、合わない物は捨てる(壊れていても監視は続ける。INV-9)。
import type { Nums } from "./metrics";

export type Kind = "change" | "recreate" | "startup" | "delete";

export interface Row {
	at: string;               // 現地時刻 ISO 8601、UTC からの差つき
	kind: Kind;
	path: string;
	before: Nums;
	after: Nums;              // delete は [0,0,0]
	vanished: number;         // startup・delete は headingCount の差
	editorRecent: boolean | null; // FR-7。startup・delete は null
	platform: "desktop" | "mobile";
	detected: boolean;
}

export interface Detection {
	row: Row;
	vanishedHeadings: string[]; // startup・delete では空
}

export interface RecordsData {
	total: number;
	rows: Row[];
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** 現地時刻の ISO 8601(秒まで、UTC からの差つき)。例 2026-09-25T18:35:00+09:00 */
export function isoLocal(d: Date): string {
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? "+" : "-";
	const a = Math.abs(off);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		+ `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 検出の時刻から日数を足した現地時刻(分まで)。スナップショットの期限の目安(§9.5) */
export function deadline(at: string, days: number): string {
	return isoLocal(new Date(Date.parse(at) + days * 86400000)).slice(0, 16).replace("T", " ");
}

/** 1行足し、上限を超えたら古い行から捨てる(FR-6) */
export function pushRow(data: RecordsData, row: Row, limit: number): void {
	data.rows.push(row);
	if (data.rows.length > limit) data.rows.splice(0, data.rows.length - limit);
}

/** 検出の後に、同じパスで記録された縮みの数(一覧の「その後 n 回縮んだ」) */
export function laterCount(rows: Row[], det: Detection): number {
	return rows.filter((r) => r.path === det.row.path && r.at > det.row.at).length;
}

const KINDS = new Set(["change", "recreate", "startup", "delete"]);

function isNums(v: unknown): v is Nums {
	return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));
}

function isRow(v: unknown): v is Row {
	if (typeof v !== "object" || v === null) return false;
	const r = v as Record<string, unknown>;
	return typeof r.at === "string" && typeof r.kind === "string" && KINDS.has(r.kind) && typeof r.path === "string"
		&& isNums(r.before) && isNums(r.after) && typeof r.vanished === "number"
		&& (r.editorRecent === null || typeof r.editorRecent === "boolean")
		&& (r.platform === "desktop" || r.platform === "mobile") && typeof r.detected === "boolean";
}

export function parseBaseline(raw: unknown): Record<string, Nums> {
	const out: Record<string, Nums> = {};
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
	for (const [p, v] of Object.entries(raw)) if (isNums(v)) out[p] = v;
	return out;
}

export function parseRecords(raw: unknown): RecordsData {
	if (typeof raw !== "object" || raw === null) return { total: 0, rows: [] };
	const r = raw as Record<string, unknown>;
	const rows = Array.isArray(r.rows) ? r.rows.filter(isRow) : [];
	const total = typeof r.total === "number" && Number.isFinite(r.total) ? r.total : rows.length;
	return { total, rows };
}

export function parseOpen(raw: unknown): Detection[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((d): d is Detection => {
		if (typeof d !== "object" || d === null) return false;
		const x = d as Record<string, unknown>;
		return isRow(x.row) && Array.isArray(x.vanishedHeadings) && x.vanishedHeadings.every((h) => typeof h === "string");
	});
}
