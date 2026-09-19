/**
 * The asset loader, and the one place a file's meaning is decided.
 *
 * What an image *is* — a single picture, or a sheet of frames on a grid — is
 * a property of the asset, not of the call site that happens to draw it.
 * Settling it here once, read from the manifest, is what lets an entity ask
 * for a frame by name and lets the stage list what the game owns.
 */

/** A single picture drawn whole. */
export interface ImageAsset {
  readonly id: string;
  /** Relative to the deployed page. Never an absolute path and never a URL. */
  readonly path: string;
  readonly role: "image";
}

/** A sheet of equally sized frames, read left to right, top to bottom. */
export interface SpritesheetAsset {
  readonly id: string;
  readonly path: string;
  readonly role: "spritesheet";
  readonly frameWidth: number;
  readonly frameHeight: number;
}

/**
 * A sheet of equally sized tiles read by tile id, the way a map file numbers
 * them: left to right, top to bottom, from `firstId`. The same grid as a sprite
 * sheet, named for what it is so a level reader and an entity's animation
 * never share an asset by accident.
 */
export interface TilesetAsset {
  readonly id: string;
  readonly path: string;
  readonly role: "tileset";
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** The id of the top-left tile; Tiled numbers a tileset from its `firstgid`. */
  readonly firstId: number;
}

export interface BinaryAsset {
  readonly id: string;
  readonly path: string;
  readonly role: "audio" | "data";
}

export type Asset = ImageAsset | SpritesheetAsset | TilesetAsset | BinaryAsset;

/** One frame of a sheet, as `drawImage` takes it. */
export interface Frame {
  readonly image: HTMLImageElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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

function decode(asset: Asset): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`asset ${asset.id} at ${asset.path} did not decode`));
    image.src = asset.path;
  });
}

export class AssetLoader {
  private readonly loaded = new Map<string, Promise<HTMLImageElement>>();

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

  /** The decoded picture behind an `image` or `spritesheet` entry. */
  image(id: string): Promise<HTMLImageElement> {
    const cached = this.loaded.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const asset = this.entry(id);
    if (asset.role !== "image" && asset.role !== "spritesheet" && asset.role !== "tileset") {
      throw new Error(`asset ${id} is not an image`);
    }
    const pending = decode(asset);
    this.loaded.set(id, pending);
    return pending;
  }

  /** Frame `index` of a sheet, counted left to right then top to bottom. */
  async frame(id: string, index: number): Promise<Frame> {
    const asset = this.entry(id);
    if (asset.role !== "spritesheet") {
      throw new Error(`asset ${id} is not a spritesheet`);
    }
    const image = await this.image(id);
    const columns = Math.floor(image.naturalWidth / asset.frameWidth);
    if (columns === 0) {
      throw new Error(`asset ${id} is narrower than one of its frames`);
    }
    return {
      image,
      x: (index % columns) * asset.frameWidth,
      y: Math.floor(index / columns) * asset.frameHeight,
      width: asset.frameWidth,
      height: asset.frameHeight,
    };
  }

  /** The tile numbered `tileId` in a tileset, as `drawImage` takes it. */
  async tile(id: string, tileId: number): Promise<Frame> {
    const asset = this.entry(id);
    if (asset.role !== "tileset") {
      throw new Error(`asset ${id} is not a tileset`);
    }
    const image = await this.image(id);
    const columns = Math.floor(image.naturalWidth / asset.tileWidth);
    if (columns === 0) {
      throw new Error(`asset ${id} is narrower than one of its tiles`);
    }
    const index = tileId - asset.firstId;
    if (index < 0) {
      throw new Error(`tile ${tileId} is below ${id}'s first id ${asset.firstId}`);
    }
    return {
      image,
      x: (index % columns) * asset.tileWidth,
      y: Math.floor(index / columns) * asset.tileHeight,
      width: asset.tileWidth,
      height: asset.tileHeight,
    };
  }
}
