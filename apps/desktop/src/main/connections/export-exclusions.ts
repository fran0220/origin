/**
 * Settings export / backup exclusion contract. Credentials never leave the device.
 */
export const SETTINGS_EXPORT_EXCLUSIONS = [
	"desktop-app/credentials",
	"desktop-app/vault-key",
	"agent/auth.json",
	"auth.json",
	"**/*.credential.json",
	"**/vault.key",
] as const;

export function isExcludedFromSettingsExport(relativePath: string): boolean {
	const normalized = relativePath.replaceAll("\\", "/");
	return SETTINGS_EXPORT_EXCLUSIONS.some((pattern) => {
		if (pattern.includes("*")) {
			const suffix = pattern.replace("**/", "");
			return normalized.endsWith(suffix) || normalized.includes(`/${suffix}`);
		}
		return normalized === pattern || normalized.startsWith(`${pattern}/`);
	});
}
