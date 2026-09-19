import { describe, expect, it } from "vitest";
import {
	consumeAuthorizationCallback,
	createPkceAuthorizationState,
	PkceAuthorizationError,
	type RedeemableAuthorization,
} from "./pkce.js";

function pendingAt(now: number): RedeemableAuthorization {
	const entropy = (() => {
		let n = 0;
		return () => Buffer.from(`seed-${n++}`.padEnd(32, "0"));
	})();
	return {
		state: createPkceAuthorizationState({
			redirectUri: "http://127.0.0.1:12345/callback",
			now,
			entropy,
		}),
		redeemed: false,
	};
}

describe("PKCE authorization state machine", () => {
	it("redeems a matching code exactly once", () => {
		const now = 1_000_000;
		const pending = pendingAt(now);
		const first = consumeAuthorizationCallback(
			pending,
			{ state: pending.state.state, code: "auth-code" },
			now + 1_000,
		);
		expect(first.code).toBe("auth-code");
		expect(first.verifier).toBe(pending.state.challenge.verifier);
		expect(() =>
			consumeAuthorizationCallback(pending, { state: pending.state.state, code: "auth-code" }, now + 2_000),
		).toThrow(PkceAuthorizationError);
		try {
			consumeAuthorizationCallback(pending, { state: pending.state.state, code: "auth-code" }, now + 2_000);
		} catch (error) {
			expect((error as PkceAuthorizationError).code).toBe("already-redeemed");
		}
	});

	it("rejects a mismatched state", () => {
		const now = 1_000_000;
		const pending = pendingAt(now);
		expect(() => consumeAuthorizationCallback(pending, { state: "other-state", code: "auth-code" }, now)).toThrow(
			/state-mismatch/,
		);
		expect(pending.redeemed).toBe(false);
	});

	it("rejects an expired authorization", () => {
		const now = 1_000_000;
		const pending = pendingAt(now);
		expect(() =>
			consumeAuthorizationCallback(
				pending,
				{ state: pending.state.state, code: "auth-code" },
				pending.state.expiresAt + 1,
			),
		).toThrow(/expired/);
	});

	it("rejects a missing code and a redirect mismatch", () => {
		const now = 1_000_000;
		const pending = pendingAt(now);
		expect(() => consumeAuthorizationCallback(pending, { state: pending.state.state, code: null }, now)).toThrow(
			/missing-code/,
		);
		expect(() =>
			consumeAuthorizationCallback(
				pending,
				{ state: pending.state.state, code: "auth-code", redirectUri: "http://127.0.0.1:9/callback" },
				now,
			),
		).toThrow(/redirect-mismatch/);
	});
});
