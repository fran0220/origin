/** Electron NativeImage.toBitmap() is BGRA; the FrameEncoder port is RGBA8888. */
export function bgraToRgba(bgra: Uint8Array): Uint8Array {
	const rgba = new Uint8Array(bgra.byteLength);
	for (let index = 0; index < bgra.byteLength; index += 4) {
		rgba[index] = bgra[index + 2] ?? 0;
		rgba[index + 1] = bgra[index + 1] ?? 0;
		rgba[index + 2] = bgra[index] ?? 0;
		rgba[index + 3] = bgra[index + 3] ?? 255;
	}
	return rgba;
}
