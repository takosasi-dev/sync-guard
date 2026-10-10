// 控えの取り直しの確認(FR-18)。「取り直す」が押されたときだけ onYes を呼ぶ。
import { Modal, Setting, type App } from "obsidian";
import { S } from "../strings";

export class ConfirmModal extends Modal {
	constructor(app: App, private text: string, private onYes: () => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("p", { text: this.text });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText(S.resetCancel).onClick(() => this.close()))
			.addButton((b) => b.setButtonText(S.resetDo).setDestructive().onClick(() => {
				this.onYes();
				this.close();
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
