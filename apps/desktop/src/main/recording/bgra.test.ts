import { describe, expect, it } from "vitest";
import { bgraToRgba } from "./bgra.js";

describe("bgraToRgba", () => {
	it("swaps B and R while keeping G and alpha", () => {
		const bgra = Uint8Array.from([10, 20, 30, 40, 1, 2, 3, 255]);
		expect([...bgraToRgba(bgra)]).toEqual([30, 20, 10, 40, 3, 2, 1, 255]);
	});
});
