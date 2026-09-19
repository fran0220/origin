import type { UserMessage } from "@origin/ai";
import type { ContinuationPolicyContext } from "@origin/runtime-core/kernel";

export interface CodingAgentContinuationSource {
	collect(context: ContinuationPolicyContext): Promise<readonly UserMessage[]>;
}
