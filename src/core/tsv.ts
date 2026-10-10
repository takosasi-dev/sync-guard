// 記録を TSV にする(§9.7・FR-8)。obsidian を import しない純関数。
// 1行目は列名。パスのタブと改行は空白1つに置き換える。改行は \n。
import type { Row } from "./records";

const HEADER = ["at", "kind", "path", "lines_before", "lines_after", "chars_before", "chars_after",
	"headings_before", "headings_after", "vanished", "editor_recent", "platform", "detected"];

export function toTsv(rows: Row[]): string {
	const lines = rows.map((r) => [
		r.at, r.kind, r.path.replace(/\r\n|[\t\r\n]/g, " "),
		r.before[0], r.after[0], r.before[1], r.after[1], r.before[2], r.after[2], r.vanished,
		r.editorRecent === null ? "" : r.editorRecent ? "1" : "0",
		r.platform, r.detected ? "1" : "0",
	].join("\t"));
	return [HEADER.join("\t"), ...lines].join("\n") + "\n";
}
