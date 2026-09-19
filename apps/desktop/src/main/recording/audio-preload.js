const { contextBridge, ipcRenderer } = require("electron");

const CHANNEL = "vetta:recording:audio";

contextBridge.exposeInMainWorld("__vettaRecordingAudio", {
	send(payload) {
		ipcRenderer.send(CHANNEL, payload);
	},
	setRecordingId(recordingId) {
		window.__vettaRecordingId = recordingId;
	},
});

function installAudioCapture() {
	const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
	if (!OriginalAudioContext || window.__vettaRecordingAudioInstalled) return;
	window.__vettaRecordingAudioInstalled = true;

	const destinationNodes = new Set();
	let recorder = null;
	let started = false;

	const proto = OriginalAudioContext.prototype;
	const originalDestination = Object.getOwnPropertyDescriptor(proto, "destination");
	if (originalDestination?.get) {
		Object.defineProperty(proto, "destination", {
			configurable: true,
			get() {
				if (!this.__vettaCaptureDest) {
					this.__vettaCaptureDest = this.createMediaStreamDestination();
					try {
						this.__vettaCaptureDest.connect(originalDestination.get.call(this));
					} catch {
						// Some contexts refuse a second connection; capture still works.
					}
					destinationNodes.add(this.__vettaCaptureDest.stream);
					maybeStart();
				}
				return this.__vettaCaptureDest;
			},
		});
	}

	function maybeStart() {
		if (started || destinationNodes.size === 0) return;
		const [stream] = destinationNodes;
		if (!stream) return;
		started = true;
		try {
			recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
		} catch {
			window.__vettaRecordingAudio.send({
				type: "unavailable",
				recordingId: window.__vettaRecordingId,
			});
			return;
		}
		recorder.ondataavailable = (event) => {
			if (!event.data || event.data.size === 0) return;
			event.data.arrayBuffer().then((buffer) => {
				window.__vettaRecordingAudio.send({
					type: "chunk",
					recordingId: window.__vettaRecordingId,
					data: Array.from(new Uint8Array(buffer)),
				});
			});
		};
		recorder.onstop = () =>
			window.__vettaRecordingAudio.send({ type: "end", recordingId: window.__vettaRecordingId });
		recorder.start(1_000);
		window.__vettaRecordingAudio.send({ type: "start", recordingId: window.__vettaRecordingId });
	}

	window.addEventListener("vetta-recording-stop-audio", () => {
		if (recorder && recorder.state !== "inactive") recorder.stop();
	});
}

window.addEventListener("DOMContentLoaded", installAudioCapture);
installAudioCapture();
