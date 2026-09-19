const AUTHORIZATION_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi;
const SENSITIVE_QUERY_PATTERN =
	/([?&](?:access_token|api_key|apikey|authorization|refresh_token|secret|token)=)[^&#\s]+/gi;
const KNOWN_KEY_PREFIX_PATTERN = /\b((?:sk|rk|pk|ak|xox[baprs]|ghp|gho|github_pat|xai|AIza)[-_][a-zA-Z0-9._-]{8,})\b/g;
const HEADER_SECRET_PATTERN = /((?:authorization|x-api-key|api-key|apikey|proxy-authorization)\s*[:=]\s*)([^\s,;]+)/gi;

export interface SecretScrubOptions {
	readonly knownSecrets?: readonly string[];
}

export function scrubSecrets(value: string, options: SecretScrubOptions = {}): string {
	let next = value
		.replace(AUTHORIZATION_PATTERN, "$1[redacted]")
		.replace(JWT_PATTERN, "[redacted-jwt]")
		.replace(SENSITIVE_QUERY_PATTERN, "$1[redacted]")
		.replace(HEADER_SECRET_PATTERN, "$1[redacted]")
		.replace(KNOWN_KEY_PREFIX_PATTERN, "[redacted-key]");
	for (const secret of options.knownSecrets ?? []) {
		if (secret.length < 8) continue;
		next = next.split(secret).join("[redacted-secret]");
	}
	return next;
}

export function scrubUnknown(value: unknown, options: SecretScrubOptions = {}): unknown {
	if (typeof value === "string") return scrubSecrets(value, options);
	if (Array.isArray(value)) return value.map((item) => scrubUnknown(item, options));
	if (value && typeof value === "object") {
		const record: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (isSecretKey(key) && typeof item === "string") {
				record[key] = item.length === 0 ? "" : "[redacted]";
			} else {
				record[key] = scrubUnknown(item, options);
			}
		}
		return record;
	}
	return value;
}

function isSecretKey(key: string): boolean {
	const lower = key.toLowerCase();
	return (
		lower.includes("token") ||
		lower.includes("secret") ||
		lower.includes("password") ||
		lower.includes("apikey") ||
		lower.includes("api-key") ||
		lower.includes("authorization") ||
		lower.includes("credential")
	);
}
