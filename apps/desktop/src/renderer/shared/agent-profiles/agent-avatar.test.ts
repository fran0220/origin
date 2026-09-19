import { describe, expect, it } from "vitest";
import { AGENT_AVATAR_OPTIONS, agentAvatarUrl } from "./agent-avatar";

describe("Agent avatar options", () => {
	it("exposes all bundled WebP choices and falls back deterministically per profile", () => {
		expect(AGENT_AVATAR_OPTIONS).toHaveLength(9);
		expect(AGENT_AVATAR_OPTIONS.every((avatar) => avatar.endsWith(".webp"))).toBe(true);
		// 宿主不认识任何角色：没有提供方的图时，兜底只按档案 id 稳定取一张。
		expect(AGENT_AVATAR_OPTIONS).toContain(agentAvatarUrl({ id: "a" }));
		expect(agentAvatarUrl({ id: "a" })).toBe(agentAvatarUrl({ id: "a" }));
	});

	it("prefers the provider's avatar over the fallback", () => {
		const provided = "data:image/webp;base64,ZmFrZQ==";
		expect(agentAvatarUrl({ id: "a" }, { avatarUrl: provided })).toBe(provided);
	});

	it("prefers a saved custom avatar and rewrites retired numbered paths", () => {
		expect(agentAvatarUrl({ id: "a", avatar: "./agent-profile-avatars/router.webp" })).toBe(
			"./agent-profile-avatars/router.webp",
		);
		expect(agentAvatarUrl({ id: "a", avatar: "./agent-profile-avatars/avatar-09.webp" })).toBe(
			"./agent-profile-avatars/router.webp",
		);
		// 用户挑过的图压过提供方的图：那是用户数据。
		expect(
			agentAvatarUrl({ id: "a", avatar: "./agent-profile-avatars/router.webp" }, { avatarUrl: "data:image/webp;," }),
		).toBe("./agent-profile-avatars/router.webp");
	});
});
