// 検出の通知(FR-11・FR-16)。利用者が閉じるまで残る Notice(duration 0)で、押すと詳細を開く。
// 文言は §9.4 のまま。
import { Notice } from "obsidian";
import type { Detection } from "../core/records";
import type SyncGuardPlugin from "../main";
import { S } from "../strings";
import { DetailModal } from "./detailModal";

export function showDetection(plugin: SyncGuardPlugin, det: Detection): void {
	const r = det.row;
	const text = r.kind === "delete" ? S.deleteNotice(r.path) : S.shrinkNotice(r.path, r.before, r.after, r.vanished);
	const n = new Notice(text, 0);
	n.messageEl.addEventListener("click", () => {
		n.hide();
		new DetailModal(plugin, det).open();
	});
}
