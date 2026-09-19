const { contextBridge, ipcRenderer } = require("electron");

const CHANNEL = "origin:recording:audio";

contextBridge.exposeInMainWorld("__originRecordingAudio", {
	send(payload) {
		ipcRenderer.send(CHANNEL, payload);
	},
	setRecordingId(recordingId) {
		window.__originRecordingId = recordingId;
	},
});

function installAudioCapture() {
	const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
	if (!OriginalAudioContext || window.__originRecordingAudioInstalled) return;
	window.__originRecordingAudioInstalled = true;

	const destinationNodes = new Set();
	let recorder = null;
	let started = false;

	const proto = OriginalAudioContext.prototype;
	const originalDestination = Object.getOwnPropertyDescriptor(proto, "destination");
	if (originalDestination?.get) {
		Object.defineProperty(proto, "destination", {
			configurable: true,
			get() {
				if (!this.__originCaptureDest) {
					this.__originCaptureDest = this.createMediaStreamDestination();
					try {
						this.__originCaptureDest.connect(originalDestination.get.call(this));
					} catch {
						// Some contexts refuse a second connection; capture still works.
					}
					destinationNodes.add(this.__originCaptureDest.stream);
					maybeStart();
				}
				return this.__originCaptureDest;
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
			window.__originRecordingAudio.send({
				type: "unavailable",
				recordingId: window.__originRecordingId,
			});
			return;
		}
		recorder.ondataavailable = (event) => {
			if (!event.data || event.data.size === 0) return;
			event.data.arrayBuffer().then((buffer) => {
				window.__originRecordingAudio.send({
					type: "chunk",
					recordingId: window.__originRecordingId,
					data: Array.from(new Uint8Array(buffer)),
				});
			});
		};
		recorder.onstop = () =>
			window.__originRecordingAudio.send({ type: "end", recordingId: window.__originRecordingId });
		recorder.start(1_000);
		window.__originRecordingAudio.send({ type: "start", recordingId: window.__originRecordingId });
	}

	window.addEventListener("vetta-recording-stop-audio", () => {
		if (recorder && recorder.state !== "inactive") recorder.stop();
	});
}

window.addEventListener("DOMContentLoaded", installAudioCapture);
installAudioCapture();
