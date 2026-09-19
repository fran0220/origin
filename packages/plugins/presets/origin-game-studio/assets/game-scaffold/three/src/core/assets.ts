/**
 * The asset loader, and the one place colour space is decided.
 *
 * A texture's colour space is a property of what the texture *means*, not of
 * the file it arrived in. Albedo and emissive carry colour a person chose and
 * are sRGB-encoded; normals, ARM packs, height fields and data maps carry
 * numbers and must stay linear. Getting this wrong does not throw — it just
 * makes everything slightly wrong forever, which is why it is settled here
 * once and read from the manifest rather than at each call site.
 */

import {
  LinearSRGBColorSpace,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type ColorSpace,
} from "three/webgpu";

/** What a texture means, which is what decides how it is decoded. */
export type TextureRole = "color" | "emissive" | "normal" | "arm" | "height" | "data";

const COLOR_SPACE: Readonly<Record<TextureRole, ColorSpace>> = {
  color: SRGBColorSpace,
  emissive: SRGBColorSpace,
  normal: LinearSRGBColorSpace,
  arm: LinearSRGBColorSpace,
  height: LinearSRGBColorSpace,
  data: NoColorSpace,
};

export interface TextureAsset {
  readonly id: string;
  /** Relative to the deployed page. Never an absolute path and never a URL. */
  readonly path: string;
  readonly role: TextureRole;
}

export interface BinaryAsset {
  readonly id: string;
  readonly path: string;
  readonly role: "mesh" | "audio" | "data";
}

export type Asset = TextureAsset | BinaryAsset;

/**
 * Every path is relative, and the manifest is the only place they are
 * written. A provider URL expires; an absolute path is one machine's truth.
 */
export function assertRelative(asset: Asset): void {
  const looksAbsolute = asset.path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(asset.path);
  if (looksAbsolute || asset.path.includes("..")) {
    throw new Error(`asset ${asset.id} declares ${asset.path}, which is not a relative project path`);
  }
}

export class AssetLoader {
  private readonly textures = new TextureLoader();
  private readonly loaded = new Map<string, Promise<Texture>>();

  constructor(private readonly manifest: readonly Asset[]) {
    for (const asset of manifest) {
      assertRelative(asset);
    }
  }

  entry(id: string): Asset {
    const found = this.manifest.find((asset) => asset.id === id);
    if (found === undefined) {
      throw new Error(`asset ${id} is not in src/assets/manifest.ts`);
    }
    return found;
  }

  texture(id: string): Promise<Texture> {
    const cached = this.loaded.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const asset = this.entry(id);
    if (!("role" in asset) || !(asset.role in COLOR_SPACE)) {
      throw new Error(`asset ${id} is not a texture`);
    }
    const role = asset.role as TextureRole;
    const pending = this.textures.loadAsync(asset.path).then((texture) => {
      texture.colorSpace = COLOR_SPACE[role];
      texture.name = asset.id;
      return texture;
    });
    this.loaded.set(id, pending);
    return pending;
  }
}
