// Sync Guard の入口: 設定と端末の記録を読み、コマンド4つと設定画面を足し、onLayoutReady で控えを作ってイベントを登録する(§2)。
// 使うのは metadataCache の cache だけで、'changed' の本文は使わない(INV-2)。vault には書かない(INV-1)。
import { Notice, Platform, Plugin, TFile } from "obsidian";
import { toTsv } from "./core/tsv";
import { normalizeSettings, type Settings } from "./settings";
import { SyncGuardSettingTab } from "./settingsTab";
import { Store } from "./store";
import { S } from "./strings";
import { ConfirmModal } from "./ui/confirmModal";
import { ListModal } from "./ui/listModal";
import { showDetection } from "./ui/notice";
import { Watcher } from "./watcher";

export default class SyncGuardPlugin extends Plugin {
	settings: Settings = normalizeSettings(null).settings;
	watcher!: Watcher;
	private store!: Store;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new Store(this.app, this.manifest.id, () => this.watcher.collect());
		this.watcher = new Watcher({
			settings: () => this.settings,
			files: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
			cache: (path) => {
				const f = this.app.vault.getFileByPath(path);
				return f ? this.app.metadataCache.getFileCache(f) : null;
			},
			notify: (det) => showDetection(this, det),
			dirty: () => this.store.dirty(),
			platform: Platform.isMobile ? "mobile" : "desktop",
		}, this.store.loadRecords(), this.store.loadOpen());

		this.addCommand({ id: "show-detections", name: S.cmdList, callback: () => new ListModal(this).open() });
		this.addCommand({ id: "copy-records", name: S.cmdCopy, callback: () => void this.copyRecords() });
		this.addCommand({ id: "check-now", name: S.cmdCheck, callback: () => {
			const { n, k } = this.watcher.checkNow();
			new Notice(S.checked(n, k));
		} });
		this.addCommand({ id: "reset-baseline", name: S.cmdReset, callback: () => {
			new ConfirmModal(this.app, S.resetConfirm(this.watcher.detections().length), () => this.watcher.resetAll()).open();
		} });
		this.addSettingTab(new SyncGuardSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.watcher.start(this.store.loadBaseline());
			this.registerEvent(this.app.metadataCache.on("changed", (file, _data, cache) => this.watcher.changed(file.path, cache)));
			this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
				if (f instanceof TFile) this.watcher.renamed(oldPath, f.path);
			}));
			this.registerEvent(this.app.vault.on("delete", (f) => {
				if (f instanceof TFile) this.watcher.removed(f.path);
			}));
			this.registerEvent(this.app.vault.on("create", (f) => {
				if (f instanceof TFile) this.watcher.created(f.path);
			}));
			this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
				if (info.file) this.watcher.edited(info.file.path);
			}));
		});
	}

	onunload(): void {
		this.watcher.stop();
		this.store.flush();
	}

	private async copyRecords(): Promise<void> {
		const r = this.watcher.records;
		try {
			await navigator.clipboard.writeText(toTsv(r.rows));
			new Notice(S.copied(r.rows.length, r.total));
		} catch (e) {
			console.error("[sync-guard] copy", e);
		}
	}

	async loadSettings(): Promise<void> {
		let raw: unknown = null;
		let failed = false;
		try {
			raw = await this.loadData();
		} catch (e) {
			console.error("[sync-guard] data.json", e);
			failed = true;
		}
		const r = normalizeSettings(raw, failed);
		this.settings = r.settings;
		if (r.problem) new Notice(S.settingsBroken); // data.json は上書きしない(§10)
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
