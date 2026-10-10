// 設定画面(getSettingDefinitions、1.13.0 以降。D-17)。閾値の空欄は null、不正な値は保存しない(§10)。
// 閾値が1つも無い間は「通知する」を保存しない(FR-9・INV-8)。除外フォルダを変えたら控えを作り直す(§10)。
import { App, normalizePath, Notice, PluginSettingTab, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
import { usable } from "./core/judge";
import type SyncGuardPlugin from "./main";
import { checkText, type Settings } from "./settings";
import { S } from "./strings";

type NumKind = "abs" | "ratio" | "ms" | "count";
const NUM_KEYS: Record<string, NumKind> = {
	"lines.abs": "abs", "lines.ratio": "ratio", "chars.abs": "abs", "chars.ratio": "ratio", vanishedHeadings: "abs",
	settleMs: "ms", editorRecentMs: "ms", startupDelayMs: "ms", recordLimit: "count", snapshotRetentionDays: "count",
};

function getNum(s: Settings, key: string): number | null {
	switch (key) {
		case "lines.abs": return s.lines.abs;
		case "lines.ratio": return s.lines.ratio;
		case "chars.abs": return s.chars.abs;
		case "chars.ratio": return s.chars.ratio;
		case "vanishedHeadings": return s.vanishedHeadings;
		case "settleMs": return s.settleMs;
		case "editorRecentMs": return s.editorRecentMs;
		case "startupDelayMs": return s.startupDelayMs;
		case "recordLimit": return s.recordLimit;
		default: return s.snapshotRetentionDays;
	}
}

function setNum(s: Settings, key: string, n: number | null): void {
	switch (key) {
		case "lines.abs": s.lines.abs = n; break;
		case "lines.ratio": s.lines.ratio = n; break;
		case "chars.abs": s.chars.abs = n; break;
		case "chars.ratio": s.chars.ratio = n; break;
		case "vanishedHeadings": s.vanishedHeadings = n; break;
		case "settleMs": s.settleMs = n ?? s.settleMs; break;
		case "editorRecentMs": s.editorRecentMs = n ?? s.editorRecentMs; break;
		case "startupDelayMs": s.startupDelayMs = n ?? s.startupDelayMs; break;
		case "recordLimit": s.recordLimit = n ?? s.recordLimit; break;
		case "snapshotRetentionDays": s.snapshotRetentionDays = n ?? s.snapshotRetentionDays; break;
	}
}

export class SyncGuardSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly owner: SyncGuardPlugin) {
		super(app, owner);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const num = (name: string, key: string, desc?: string): SettingDefinition => ({
			name, desc, control: { type: "text", key, validate: (v: string) => checkText(NUM_KEYS[key] ?? "ms", v) },
		});
		return [
			{ type: "group", items: [
				{ name: S.setMode, desc: S.setModeDesc, control: { type: "dropdown", key: "mode",
					options: { record: S.modeRecord, alert: S.modeAlert },
					validate: (v: string) => (v === "alert" && !usable(this.owner.settings) ? S.noThreshold : undefined) } },
				{ name: S.setExclude, desc: S.setExcludeDesc, control: { type: "textarea", key: "excludeFolders", rows: 3 } },
			] },
			{ type: "group", heading: S.setHeadingThreshold, items: [
				num(S.setLinesAbs, "lines.abs"),
				num(S.setLinesRatio, "lines.ratio", S.setRatioDesc),
				num(S.setCharsAbs, "chars.abs"),
				num(S.setCharsRatio, "chars.ratio", S.setRatioDesc),
				num(S.setVanished, "vanishedHeadings"),
			] },
			{ type: "group", heading: S.setHeadingTiming, items: [
				num(S.setSettle, "settleMs"),
				num(S.setEditorRecent, "editorRecentMs"),
				{ name: S.setStartupCheck, desc: S.setStartupCheckDesc, control: { type: "toggle", key: "startupCheck" } },
				num(S.setStartupDelay, "startupDelayMs"),
			] },
			{ type: "group", heading: S.setHeadingOther, items: [
				{ name: S.setNotifyDelete, control: { type: "toggle", key: "notifyOnDelete" } },
				num(S.setRecordLimit, "recordLimit"),
				num(S.setRetention, "snapshotRetentionDays", S.setRetentionDesc),
			] },
		];
	}

	getControlValue(key: string): unknown {
		const s = this.owner.settings;
		if (key === "excludeFolders") return s.excludeFolders.join("\n");
		if (key in NUM_KEYS) {
			const v = getNum(s, key);
			return v === null ? "" : String(v);
		}
		if (key === "mode") return s.mode;
		if (key === "startupCheck") return s.startupCheck;
		if (key === "notifyOnDelete") return s.notifyOnDelete;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.owner.settings;
		let resync = false;
		if (key === "mode") {
			if (value === "alert" && !usable(s)) {
				new Notice(S.noThreshold);
				return;
			}
			s.mode = value === "alert" ? "alert" : "record";
		} else if (key === "excludeFolders") {
			const list = String(value).split(/\r?\n/).map((x) => normalizePath(x.trim())).filter((x) => x !== "" && x !== "/");
			s.excludeFolders = [...new Set(list)];
			resync = true;
		} else if (key in NUM_KEYS) {
			const t = String(value).trim();
			if (checkText(NUM_KEYS[key] ?? "ms", t)) return; // 不正な値は保存しない
			setNum(s, key, t === "" ? null : Number(t));
			if (s.mode === "alert" && !usable(s)) s.mode = "record"; // 閾値を消したら「記録だけ」に戻す(INV-8)
		} else if (key === "startupCheck" || key === "notifyOnDelete") {
			s[key] = value === true;
		}
		await this.owner.saveSettings();
		if (resync) this.owner.watcher.syncTargets();
	}
}
