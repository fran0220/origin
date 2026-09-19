export const EVALUATION_RUN_TOOL_DESCRIPTION = `Run an Evaluation definition against the current subject.

Evaluation is the durable record of whether work met explicit criteria. Evidence must come from captured records or a real verifier — never from an assistant assertion. A run freezes the definition revision, captures evidence, settles each criterion, and writes an immutable Attempt.

Use evaluation_list first if you do not already know the definition id.`;

export const EVALUATION_LIST_TOOL_DESCRIPTION = `List Evaluation definitions and recent attempts for the current subject.

Returns definition ids, revisions, titles, and the latest attempt outcomes. Use this before evaluation_run or evaluation_get.`;

export const EVALUATION_GET_TOOL_DESCRIPTION = `Read one Evaluation attempt: criterion findings, cited evidence, and the terminal outcome.

The attempt is immutable. Model review notes may appear on findings; they are not evidence.`;
