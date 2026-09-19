/** Compare decoded RGBA pixels, not PNG encodings or image filenames. */
export async function comparePngImages(before: string, after: string): Promise<number> {
	const baseline = await decodePng(before);
	const current = await decodePng(after);
	if (baseline.width !== current.width || baseline.height !== current.height) {
		throw new Error("Golden image dimensions differ; record a new baseline");
	}
	let different = 0;
	for (let offset = 0; offset < baseline.data.length; offset += 4) {
		if (
			baseline.data[offset] !== current.data[offset] ||
			baseline.data[offset + 1] !== current.data[offset + 1] ||
			baseline.data[offset + 2] !== current.data[offset + 2] ||
			baseline.data[offset + 3] !== current.data[offset + 3]
		)
			different++;
	}
	return different / (baseline.width * baseline.height);
}

async function decodePng(dataUrl: string): Promise<ImageData> {
	if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Golden evidence must be a PNG data URL");
	const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
	try {
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Image comparison requires a 2D canvas");
		context.drawImage(image, 0, 0);
		return context.getImageData(0, 0, image.width, image.height);
	} finally {
		image.close();
	}
}
