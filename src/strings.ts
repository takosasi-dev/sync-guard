// 画面の文字をまとめる(§9.4・§9.5)。§9.4 の文はそのまま使う。
// 戻し方の画面の名前は §8.3 の UI_LABELS_JA が貼られたら置き換える(今は仕様書の文のまま)。
import type { Kind } from "./core/records";
import type { Nums } from "./core/metrics";

export const S = {
	cmdList: "未確認の縮みを一覧する",
	cmdCopy: "記録をコピー",
	cmdCheck: "今すぐ控えと比べる",
	cmdReset: "控えを今の状態で取り直す",

	shrinkNotice: (path: string, b: Nums, a: Nums, v: number) =>
		`縮んだノートがあります: ${path}(行 ${b[0]}→${a[0]}・文字 ${b[1]}→${a[1]}・消えた見出し ${v})。押すと詳細を開きます`,
	deleteNotice: (path: string) => `ノートが消えました: ${path}。押すと詳細を開きます`,
	noThreshold: "閾値が1つも決まっていないので「通知する」にできません",
	copied: (rows: number, total: number) => `記録をコピーしました(${rows} 行・変化の総数 ${total})`,
	checked: (n: number, k: number) => `比べました: ${n} 件中、縮み ${k} 件`,
	resetConfirm: (n: number) => `すべてのノートの控えを今の状態で取り直します。未確認の縮み ${n} 件は確認済みになります`,
	listEmpty: "未確認の縮みはありません",
	storeFailed: "端末に記録を残せません。再起動すると記録が消えます",
	errPositive: "0 より大きい数にしてください",
	errRatio: "割合は 0 より大きく 1 以下にしてください",
	errMs: "0 以上の整数にしてください",
	errCount: "1 以上の整数にしてください",
	settingsBroken: "設定(data.json)が読めないので、既定値(記録だけ)で動きます。data.json は書き換えていません",

	// 詳細(§9.5)
	titleShrink: (path: string) => `縮んだノート: ${path}`,
	titleDelete: (path: string) => `消えたノート: ${path}`,
	detectedAt: (at: string, kind: Kind) => `検出: ${at}(${KIND_LABEL[kind]})`,
	colBefore: "前",
	colAfter: "後",
	colDiff: "差",
	rowLines: "行",
	rowChars: "文字",
	rowHeadings: "見出し",
	vanishedHeading: "消えた見出し",
	vanishedNone: "なし",
	vanishedUnknown: "起動前の見出しは控えていません",
	editorRecent: (sec: number) => `この端末のエディタで ${sec} 秒以内に変更がありました(参考)`,
	restoreHeading: "戻し方",
	restoreFileRecovery: (days: number, until: string) =>
		"ファイル復元: 設定 → ファイル復元 → Snapshots の View → ファイル名を入れる → 検出の時刻より前の版を選ぶ → Show changes で消えた所を見る → Copy で足りない所だけ貼る。"
		+ `Restore はファイル全体を置き換え、検出の後に足した分も消えます。スナップショットはこの端末にだけあり、${days} 日で消えます(検出より前の版は、遅くとも ${until} までに消えます)`,
	restoreSync: "Sync を使っているとき: ファイル一覧でノートを選び Open version history(iPhone は長押し)。消えたノートは 設定 → Sync → Deleted files",
	restoreLog: "どの端末の版が勝ったかは、Sync のログで Merge Conflicts か Conflict を探す",
	openNote: "ノートを開く",
	confirm: "確認した(今の状態を控えにする)",

	// 一覧(FR-15)
	laterShrinks: (n: number) => `その後 ${n} 回縮んだ`,
	summary: (b: Nums, a: Nums, v: number) => `行 ${b[0]}→${a[0]}・文字 ${b[1]}→${a[1]}・消えた見出し ${v}`,

	// 取り直しの確認(FR-18)
	resetDo: "取り直す",
	resetCancel: "やめる",

	// 設定画面
	setMode: "動き方",
	setModeDesc: "閾値が決まるまでは「記録だけ」で動かし、記録をコピーして普段の減り方を見てください",
	modeRecord: "記録だけ",
	modeAlert: "通知する",
	setExclude: "除外フォルダ",
	setExcludeDesc: "1行に1つ。vault からの相対パス。このフォルダの中のノートは控えも記録も作りません",
	setHeadingThreshold: "閾値(空なら使わない)",
	setLinesAbs: "行: 減った量",
	setLinesRatio: "行: 減った割合",
	setCharsAbs: "文字: 減った量",
	setCharsRatio: "文字: 減った割合",
	setRatioDesc: "0 より大きく 1 以下。量と割合の両方が決まっているときだけ使います",
	setVanished: "消えた見出しの数",
	setHeadingTiming: "待ち時間",
	setSettle: "落ち着くまで待つ(ミリ秒)",
	setEditorRecent: "エディタの参考に使う時間(ミリ秒)",
	setStartupCheck: "起動時に比べる",
	setStartupCheckDesc: "Obsidian を閉じている間に縮んだノートを、起動の後に見つけます",
	setStartupDelay: "起動から比べるまで(ミリ秒)",
	setHeadingOther: "その他",
	setNotifyDelete: "ノートが消えたときも通知する",
	setRecordLimit: "記録の上限(行)",
	setRetention: "ファイル復元の保存日数",
	setRetentionDesc: "設定 → ファイル復元 の値を写してください。詳細の「期限の目安」にだけ使います",
};

export const KIND_LABEL: Record<Kind, string> = {
	change: "変化",
	recreate: "作り直し",
	startup: "起動時の比較",
	delete: "削除",
};
