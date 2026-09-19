import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { PluginIdSchema, PluginVersionSchema } from "./manifest-schema.js";
import { validatePluginRelativePath } from "./manifest.js";

export const ORIGIN_NPM_PACKAGE_SCHEMA_VERSION = 1 as const;

export const OriginNpmPluginMetadataSchema = Type.Object(
	{
		schemaVersion: Type.Literal(ORIGIN_NPM_PACKAGE_SCHEMA_VERSION),
		type: Type.Literal("desktop-plugin"),
		pluginId: PluginIdSchema,
		archive: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export type OriginNpmPluginMetadata = Static<typeof OriginNpmPluginMetadataSchema>;

export interface OriginNpmPluginPackage {
	name: string;
	version: string;
	vetta: OriginNpmPluginMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse the npm distribution envelope without trusting package-owned metadata. */
export function parseOriginNpmPluginPackage(value: unknown): OriginNpmPluginPackage {
	if (!isRecord(value)) throw new Error("Invalid npm plugin package: package.json must contain an object");
	if (typeof value.name !== "string" || value.name.trim().length === 0) {
		throw new Error("Invalid npm plugin package: name is required");
	}
	if (!Value.Check(PluginVersionSchema, value.version)) {
		throw new Error("Invalid npm plugin package: version must be a semantic version");
	}
	if (!Value.Check(OriginNpmPluginMetadataSchema, value.origin)) {
		throw new Error("Invalid npm plugin package: package.json#vetta does not match schema version 1");
	}

	const metadata = value.origin as OriginNpmPluginMetadata;
	return {
		name: value.name.trim(),
		version: value.version,
		originApp: {
			...metadata,
			archive: validatePluginRelativePath(metadata.archive.trim(), "npm archive"),
		},
	};
}
