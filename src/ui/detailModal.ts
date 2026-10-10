// 検出の詳細(FR-12・§9.5): パス・時刻・種類・前→後の3つの数・消えた見出し・エディタの参考・戻し方と、2つのボタン。
// 戻す操作はしない(INV-3)。戻し方は文で示すだけ。要素は createEl 系で作る(INV-6)。
import { Modal, Setting } from "obsidian";
import { deadline, type Detection } from "../core/records";
import type SyncGuardPlugin from "../main";
import { S } from "../strings";

export class DetailModal extends Modal {
	constructor(private plugin: SyncGuardPlugin, private det: Detection, private onDone?: () => void) {
		super(plugin.app);
	}

	onOpen(): void {
		const { row, vanishedHeadings } = this.det;
		const s = this.plugin.settings;
		const el = this.contentEl;
		this.setTitle(row.kind === "delete" ? S.titleDelete(row.path) : S.titleShrink(row.path));
		el.createEl("p", { text: S.detectedAt(row.at, row.kind) });

		const table = el.createEl("table", { cls: "sync-guard-table" });
		const head = table.createEl("tr");
		for (const t of ["", S.colBefore, S.colAfter, S.colDiff]) head.createEl("th", { text: t });
		for (const [name, i] of [[S.rowLines, 0], [S.rowChars, 1], [S.rowHeadings, 2]] as const) {
			const tr = table.createEl("tr");
			tr.createEl("td", { text: name });
			tr.createEl("td", { text: String(row.before[i]) });
			tr.createEl("td", { text: String(row.after[i]) });
			tr.createEl("td", { text: String(row.after[i] - row.before[i]) });
		}

		el.createEl("h4", { text: S.vanishedHeading });
		if (row.kind === "startup" || row.kind === "delete") el.createEl("p", { text: S.vanishedUnknown });
		else if (vanishedHeadings.length === 0) el.createEl("p", { text: S.vanishedNone });
		else {
			const ul = el.createEl("ul");
			for (const h of vanishedHeadings) ul.createEl("li", { text: h });
		}

		if (row.editorRecent === true) el.createEl("p", { text: S.editorRecent(s.editorRecentMs / 1000) });

		el.createEl("h4", { text: S.restoreHeading });
		const ol = el.createEl("ol");
		ol.createEl("li", { text: S.restoreFileRecovery(s.snapshotRetentionDays, deadline(row.at, s.snapshotRetentionDays)) });
		ol.createEl("li", { text: S.restoreSync });
		ol.createEl("li", { text: S.restoreLog });

		const buttons = new Setting(el);
		if (row.kind !== "delete") {
			buttons.addButton((b) => b.setButtonText(S.openNote).onClick(() => {
				const f = this.app.vault.getFileByPath(row.path);
				if (f) void this.app.workspace.getLeaf(false).openFile(f);
				this.close();
			}));
		}
		buttons.addButton((b) => b.setButtonText(S.confirm).setCta().onClick(() => {
			this.plugin.watcher.confirm(row.path);
			this.close();
			this.onDone?.();
		}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
