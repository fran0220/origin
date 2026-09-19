import type { RuntimeThreadCoordinator } from "@vetta/runtime-core";

export interface CodingAgentThreadToolHost {
	readonly getCoordinator: () => RuntimeThreadCoordinator | undefined;
}
