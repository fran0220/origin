import type { RuntimeThreadCoordinator } from "@origin/runtime-core";

export interface CodingAgentThreadToolHost {
	readonly getCoordinator: () => RuntimeThreadCoordinator | undefined;
}
