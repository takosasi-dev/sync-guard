// ノートの cache から3つの数(行・文字・見出しの並び)を作る(§9.6)。obsidian を import しない純関数。
// 本文は読まない。sections の最後の要素と headings だけを使う(INV-2・D-6)。

/** 行数・文字数・見出しの数 */
export type Nums = [lines: number, chars: number, headingCount: number];

/** CachedMetadata のうち使う所だけ(本物の CachedMetadata をそのまま渡せる形) */
export interface CacheLike {
	sections?: { position: { end: { line: number; offset: number } } }[];
	headings?: { level: number; heading: string }[];
}

/** 控え・今の状態: 3つの数と見出しの並び */
export interface Snap {
	nums: Nums;
	headings: string[];
}

export const EMPTY: Snap = { nums: [0, 0, 0], headings: [] };

export function measure(cache: CacheLike): Snap {
	const s = cache.sections ?? [];
	const last = s[s.length - 1];
	const headings = (cache.headings ?? []).map((h) => "#".repeat(h.level) + " " + h.heading);
	return {
		nums: [last ? last.position.end.line + 1 : 0, last ? last.position.end.offset : 0, headings.length],
		headings,
	};
}

export function sameNums(a: Nums, b: Nums): boolean {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
