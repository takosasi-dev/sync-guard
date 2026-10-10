// data.json の型と既定値(§9.2)、読み込み時の補い、設定画面の値の検査、除外フォルダの当て方。obsidian を import しない。
// 閾値の既定は null で、null の間は「記録だけ」でしか動かない(D-8・INV-8)。端末ごとの値はここに入れない(INV-10)。
import { usable, type Threshold } from "./core/judge";
import { S } from "./strings";

export interface Settings {
	schemaVersion: 1;
	mode: "record" | "alert";
	excludeFolders: string[];
	lines: Threshold;
	chars: Threshold;
	vanishedHeadings: number | null;
	settleMs: number;
	editorRecentMs: number;
	startupCheck: boolean;
	startupDelayMs: number;
	notifyOnDelete: boolean;
	recordLimit: number;
	snapshotRetentionDays: number;
}

// 仮決めの値は NOTES.md の「仮決め一覧」(settleMs・editorRecentMs・startupDelayMs・notifyOnDelete)
export const DEFAULTS: Settings = {
	schemaVersion: 1,
	mode: "record",
	excludeFolders: [],
	lines: { abs: null, ratio: null },
	chars: { abs: null, ratio: null },
	vanishedHeadings: null,
	settleMs: 5000,
	editorRecentMs: 10000,
	startupCheck: false,
	startupDelayMs: 30000,
	notifyOnDelete: false,
	recordLimit: 2000,
	snapshotRetentionDays: 7,
};

const isPos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isRatio = (v: unknown): v is number => isPos(v) && v <= 1;
const isMs = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** 設定画面の文字の検査。空は null(閾値だけ)。正しければ undefined */
export function checkText(kind: "abs" | "ratio" | "ms" | "count", text: string): string | undefined {
	const t = text.trim();
	if (t === "" && (kind === "abs" || kind === "ratio")) return undefined;
	const n = Number(t);
	if (t === "") return kind === "ms" ? S.errMs : S.errCount;
	if (kind === "abs") return isPos(n) ? undefined : S.errPositive;
	if (kind === "ratio") return isRatio(n) ? undefined : S.errRatio;
	if (kind === "ms") return isMs(n) ? undefined : S.errMs;
	return isCount(n) ? undefined : S.errCount;
}

function threshold(v: unknown): Threshold {
	const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
	return { abs: isPos(o.abs) ? o.abs : null, ratio: isRatio(o.ratio) ? o.ratio : null };
}

/**
 * 読み込んだ data.json を設定にする。欠けた項目・不正な値は既定値で埋める。
 * schemaVersion が違う・読めないときは既定値にして problem を返す(data.json は上書きしない。§9.2・§10)。
 */
export function normalizeSettings(raw: unknown, readFailed = false): { settings: Settings; problem: boolean } {
	const fresh = (): Settings => ({ ...DEFAULTS, excludeFolders: [], lines: { ...DEFAULTS.lines }, chars: { ...DEFAULTS.chars } });
	if (readFailed) return { settings: fresh(), problem: true };
	if (raw === null || raw === undefined) return { settings: fresh(), problem: false };
	if (typeof raw !== "object" || Array.isArray(raw)) return { settings: fresh(), problem: true };
	const r = raw as Record<string, unknown>;
	if (r.schemaVersion !== 1) return { settings: fresh(), problem: true };
	const d = DEFAULTS;
	const s: Settings = {
		schemaVersion: 1,
		mode: r.mode === "alert" ? "alert" : "record",
		excludeFolders: Array.isArray(r.excludeFolders) ? r.excludeFolders.filter((x): x is string => typeof x === "string" && x !== "") : [],
		lines: threshold(r.lines),
		chars: threshold(r.chars),
		vanishedHeadings: isPos(r.vanishedHeadings) ? r.vanishedHeadings : null,
		settleMs: isMs(r.settleMs) ? r.settleMs : d.settleMs,
		editorRecentMs: isMs(r.editorRecentMs) ? r.editorRecentMs : d.editorRecentMs,
		startupCheck: typeof r.startupCheck === "boolean" ? r.startupCheck : d.startupCheck,
		startupDelayMs: isMs(r.startupDelayMs) ? r.startupDelayMs : d.startupDelayMs,
		notifyOnDelete: typeof r.notifyOnDelete === "boolean" ? r.notifyOnDelete : d.notifyOnDelete,
		recordLimit: isCount(r.recordLimit) ? r.recordLimit : d.recordLimit,
		snapshotRetentionDays: isCount(r.snapshotRetentionDays) ? r.snapshotRetentionDays : d.snapshotRetentionDays,
	};
	if (s.mode === "alert" && !usable(s)) s.mode = "record"; // FR-9・INV-8
	return { settings: s, problem: false };
}

/** フォルダ Foo は Foo/ の配下だけに効く(FooBar/ には効かない)。folders は normalizePath 済み */
export function isExcluded(path: string, folders: string[]): boolean {
	return folders.some((f) => f !== "" && path.startsWith(f + "/"));
}
