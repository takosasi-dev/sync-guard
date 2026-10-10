// 端末の中に残す3つの値(控えの数・記録・未確認の検出)を app.loadLocalStorage / saveLocalStorage で読み書きする(§9.3・D-16)。
// data.json には書かない(INV-10)。書けなければメモリだけで続け、起動ごとに1回だけ知らせる(§10)。
import { debounce, Notice, type App, type Debouncer } from "obsidian";
import { parseBaseline, parseOpen, parseRecords, type Detection, type RecordsData } from "./core/records";
import type { Nums } from "./core/metrics";
import { S } from "./strings";

export interface StoreValues {
	baseline: Record<string, Nums> | null; // null の間は baseline を書かない(FR-14)
	records: RecordsData;
	open: Detection[];
}

export class Store {
	private warned = false;
	private readonly save: Debouncer<[], void>;

	constructor(private app: App, private id: string, private collect: () => StoreValues) {
		this.save = debounce(() => this.write(), 5000, true); // 最後の変更から 5 秒後にまとめて書く
	}

	private key(name: string): string {
		return `${this.id}:${name}`;
	}

	private load(name: string): unknown {
		try {
			return this.app.loadLocalStorage(this.key(name)) as unknown;
		} catch (e) {
			console.error("[sync-guard] load", name, e);
			return null;
		}
	}

	loadBaseline(): Record<string, Nums> {
		return parseBaseline(this.load("baseline"));
	}

	loadRecords(): RecordsData {
		return parseRecords(this.load("records"));
	}

	loadOpen(): Detection[] {
		return parseOpen(this.load("open"));
	}

	dirty(): void {
		this.save();
	}

	flush(): void {
		this.save.run();
	}

	private write(): void {
		const v = this.collect();
		try {
			if (v.baseline) this.app.saveLocalStorage(this.key("baseline"), v.baseline);
			this.app.saveLocalStorage(this.key("records"), v.records);
			this.app.saveLocalStorage(this.key("open"), v.open);
		} catch (e) {
			console.error("[sync-guard] save", e);
			if (!this.warned) {
				this.warned = true;
				new Notice(S.storeFailed);
			}
		}
	}
}
