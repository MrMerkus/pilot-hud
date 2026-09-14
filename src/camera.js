/* Kamera yonetimi. AR gorunumu icin kamera akisini video etiketine baglar. */

export async function startCamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Kamera destegi bulunamadi.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });

  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(video) {
  if (!video) return;
  const stream = video.srcObject;
  if (stream && typeof stream.getTracks === 'function') {
    const tracks = stream.getTracks();
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].stop();
    }
  }
  try {
    video.pause();
  } catch (e) {}
  video.srcObject = null;
}
