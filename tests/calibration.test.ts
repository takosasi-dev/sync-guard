// AC-18 の形: 9/25 の前後の数が閾値で検出になり、観察の記録で検出になる行数が THRESHOLD_CHECK と一致するか。
// 今は全部仮(§8.3 FR_0925_METRICS と §8.6 は未記入)。9/25 の数は今の開発ログの数から推定した物、観察は合成。
// §8.3・§8.6 が貼られたら、下の3つの定数を実物の数(数だけ。パスは写さない)に差し替える。
import { describe, expect, it } from "vitest";
import { judge, type Thresholds } from "../src/core/judge";
import type { Nums } from "../src/core/metrics";

/** 9/25 の推定(NOTES の仮決め一覧): 夜の項目4つと前の総括が消えた形。[前, 後, 消えた見出し] */
const FR_0925_METRICS: [Nums, Nums, number] = [[235, 16180, 17], [163, 11230, 12], 5];

/** 閾値の候補(仮)。プラグインの既定は null のまま(D-8)。§8.6 の THRESHOLDS で差し替える */
const THRESHOLDS: Thresholds = { lines: { abs: 20, ratio: 0.2 }, chars: { abs: 1000, ratio: 0.2 }, vanishedHeadings: 3 };

/** 観察の記録の代わり(合成。普段の編集で起きそうな減り)。[前, 後, 消えた見出し] */
const OBSERVED: [Nums, Nums, number][] = [
	[[120, 5400, 8], [120, 5398, 8], 0],       // 誤字の直し
	[[80, 3000, 6], [76, 2850, 6], 0],         // 数行消す
	[[200, 12000, 15], [200, 11800, 15], 0],   // Claude がパスを一括で短く書き換える
	[[60, 2500, 5], [60, 2502, 5], 1],         // 見出しの名前を変える
	[[300, 20000, 20], [295, 19500, 20], 0],   // 総括を短く書き直す
	[[10, 300, 2], [7, 210, 2], 0],            // 小さいノートを3行削る
	[[150, 9000, 12], [148, 8950, 11], 2],     // 節を2つまとめて名前も変える
	[[40, 1500, 3], [30, 1100, 3], 0],         // チェックリストの済んだ行を消す
];
const THRESHOLD_CHECK = 0;

describe("較正(AC-18。仮の数)", () => {
	it("9/25 の前後の数は検出になる", () => {
		const [b, a, v] = FR_0925_METRICS;
		expect(judge(b, a, v, THRESHOLDS)).toBe(true);
	});
	it("観察の記録で検出になる行数が THRESHOLD_CHECK と一致する", () => {
		expect(OBSERVED.filter(([b, a, v]) => judge(b, a, v, THRESHOLDS))).toHaveLength(THRESHOLD_CHECK);
	});
});
