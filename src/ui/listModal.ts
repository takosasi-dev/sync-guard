// 未確認の検出の一覧(FR-15)。各行を押すと詳細を開き、「確認した」の後に一覧を描き直す。
// 未確認の間にさらに縮んだ回数を「その後 n 回縮んだ」で添える(§10)。
import { Modal } from "obsidian";
import { laterCount } from "../core/records";
import type SyncGuardPlugin from "../main";
import { S } from "../strings";
import { DetailModal } from "./detailModal";

export class ListModal extends Modal {
	constructor(private plugin: SyncGuardPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.setTitle(S.cmdList);
		this.render();
	}

	private render(): void {
		const el = this.contentEl;
		el.empty();
		const dets = this.plugin.watcher.detections();
		if (dets.length === 0) {
			el.createEl("p", { text: S.listEmpty });
			return;
		}
		const rows = this.plugin.watcher.records.rows;
		for (const det of dets) {
			const r = det.row;
			const item = el.createEl("button", { cls: "sync-guard-item" });
			item.createSpan({ text: r.path, cls: "sync-guard-path" });
			item.createSpan({ text: `${S.detectedAt(r.at, r.kind)}・${S.summary(r.before, r.after, r.vanished)}` });
			const n = laterCount(rows, det);
			if (n > 0) item.createSpan({ text: S.laterShrinks(n) });
			item.addEventListener("click", () => new DetailModal(this.plugin, det, () => this.render()).open());
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
