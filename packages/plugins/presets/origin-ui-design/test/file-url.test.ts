import { expect, it } from "vitest";
import { toOriginFileUrl } from "../src/cards/file-url";

it("converts a Windows path into a valid origin-file URL", () => {
	const url = toOriginFileUrl(String.raw`C:\Users\flowerwine\.origin\conversation\frame 1.png`);

	expect(url).toBe("origin-file://local/C:/Users/flowerwine/.origin/conversation/frame%201.png");
	expect(new URL(url)).toMatchObject({ host: "local", pathname: "/C:/Users/flowerwine/.origin/conversation/frame%201.png" });
});

it("preserves the leading separator of a POSIX path", () => {
	expect(toOriginFileUrl("/home/user/frame.png")).toBe("origin-file://local/home/user/frame.png");
});
