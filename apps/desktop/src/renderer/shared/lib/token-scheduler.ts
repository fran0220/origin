import { tryRefreshAccessToken } from "./api";

/**
 * 主动 refresh 调度：renderer 不再持有 JWT，按固定间隔委托主进程 refresh。
 * 写盘 / 广播仍由主进程负责。
 */

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 2 ** 31 - 1;

let timer: ReturnType<typeof setTimeout> | null = null;

const PERIODIC_REFRESH_MS = 10 * 60 * 1000;

export function scheduleProactiveRefresh(_accessToken?: string): void {
	cancelProactiveRefresh();
	const delay = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, PERIODIC_REFRESH_MS));
	timer = setTimeout(() => {
		timer = null;
		void tryRefreshAccessToken().then((outcome) => {
			if (outcome.status === "ok") scheduleProactiveRefresh();
		});
	}, delay);
}

export function cancelProactiveRefresh(): void {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
}
