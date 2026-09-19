export {
	decodeVaultRef,
	encodeVaultRef,
	isSecretFieldName,
	type LegacySecretMigrationResult,
	migrateLegacySecrets,
	storeMcpConfigSecrets,
	VAULT_REF_PREFIX,
} from "./legacy-migration.js";
export {
	OwnerOnlyFileCryptography,
	ownerOnlyKeyDirectory,
	tightenDirectoryPermissions,
	tightenFilePermissions,
} from "./owner-only-cryptography.js";
export {
	type ConnectionRelayHost,
	createConnectionRelayHost,
	type RelayRoute,
	type RelayUpstream,
} from "./relay.js";
export { type SecretScrubOptions, scrubSecrets, scrubUnknown } from "./secret-scrub.js";
export {
	ACCOUNT_ACCESS_TOKEN_REF,
	ACCOUNT_REFRESH_TOKEN_REF,
	type CredentialCryptography,
	type CredentialEntry,
	type CredentialMetadata,
	type CredentialRef,
	type CredentialVaultWarning,
	connectionSecretRef,
	mcpSecretRef,
	modelApiKeyRef,
} from "./types.js";
export { CredentialVault } from "./vault.js";
