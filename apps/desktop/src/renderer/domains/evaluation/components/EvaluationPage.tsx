import { useEvaluationPageModel } from "../hooks/useEvaluationPageModel";
import { EvaluationPageView } from "./EvaluationPageView";

export function EvaluationPage(): JSX.Element {
	return <EvaluationPageView {...useEvaluationPageModel()} />;
}
