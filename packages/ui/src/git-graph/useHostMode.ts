import { useEffect, useState } from "react";
import type { GraphHostMode } from "./types";

function readMode(): GraphHostMode {
	if (typeof document === "undefined") return "dark";
	return document.documentElement.getAttribute("data-mode") === "light" ? "light" : "dark";
}

/** Track the host theme mode written on `<html data-mode="dark|light">`. */
export function useHostMode(): GraphHostMode {
	const [mode, setMode] = useState<GraphHostMode>(readMode);
	useEffect(() => {
		const observer = new MutationObserver(() => setMode(readMode()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
		return () => observer.disconnect();
	}, []);
	return mode;
}
