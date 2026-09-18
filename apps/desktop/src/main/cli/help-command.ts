import { writeSync } from "node:fs";

export interface HelpCliCommand {
	type: "help";
}

const HELP_TEXT = `Usage:
  Origin.exe [options]
  Origin.exe action <subcommand> [options]
  Origin.exe pdf <subcommand> [options]
  Origin.exe ocr <subcommand> [options]

Options:
  -h, --help            Show this help text.
  --html-to-pdf         Convert HTML to PDF. See: Origin.exe pdf --help
  --ocr-pdf             Run OCR on a PDF. See: Origin.exe ocr --help
  --ocr-img             Run OCR on an image. See: Origin.exe ocr --help
  --agent-rpc           Start agent RPC sidecar mode.

Commands:
  action search         Search GUI actions.
  action describe       Describe a GUI action.
  action run            Run a GUI action.
  pdf html-to-pdf       Convert HTML to PDF.
  ocr pdf               Run OCR on a PDF.
  ocr img               Run OCR on an image.
`;

export function parseHelpCliCommand(argv: string[]): HelpCliCommand | null {
	if (!argv.includes("-h") && !argv.includes("--help")) return null;
	return { type: "help" };
}

export function runHelpCliCommand(): number {
	writeSync(1, HELP_TEXT);
	return 0;
}
