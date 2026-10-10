// 控えと今の比べ方(消えた見出し・減りの有無)と、閾値による判定(§9.6・D-9)。obsidian を import しない純関数。
// null を含む項目は使わない。使える閾値が1つも無ければ、どんな減りも検出にしない(INV-8)。
import type { Nums } from "./metrics";

export interface Threshold {
	abs: number | null;
	ratio: number | null;
}

export interface Thresholds {
	lines: Threshold;
	chars: Threshold;
	vanishedHeadings: number | null;
}

/** 前の見出しから後の見出しを多重集合として引いた残り。並びは前の順 */
export function vanished(before: string[], after: string[]): string[] {
	const left = new Map<string, number>();
	for (const h of after) left.set(h, (left.get(h) ?? 0) + 1);
	const out: string[] = [];
	for (const h of before) {
		const n = left.get(h) ?? 0;
		if (n > 0) left.set(h, n - 1);
		else out.push(h);
	}
	return out;
}

/** 減りが1つでもあるか(行・文字・消えた見出し) */
export function shrank(before: Nums, after: Nums, vanishedCount: number): boolean {
	return after[0] < before[0] || after[1] < before[1] || vanishedCount > 0;
}

function hitPart(before: number, after: number, t: Threshold): boolean {
	if (t.abs === null || t.ratio === null || before <= 0) return false;
	const lost = before - after;
	return lost > 0 && lost >= t.abs && lost / before >= t.ratio;
}

/** 判定に使える閾値が1つでもあるか(FR-9) */
export function usable(t: Thresholds): boolean {
	return (t.lines.abs !== null && t.lines.ratio !== null)
		|| (t.chars.abs !== null && t.chars.ratio !== null)
		|| t.vanishedHeadings !== null;
}

/** どれか1つに当たれば検出。vanishedCount は startup・delete では見出しの数の減り */
export function judge(before: Nums, after: Nums, vanishedCount: number, t: Thresholds): boolean {
	return hitPart(before[0], after[0], t.lines)
		|| hitPart(before[1], after[1], t.chars)
		|| (t.vanishedHeadings !== null && vanishedCount > 0 && vanishedCount >= t.vanishedHeadings);
}
