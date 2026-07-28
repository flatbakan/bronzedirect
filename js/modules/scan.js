// modules/scan.js — In-app QR scanner. Decodes an asset QR and opens its page.
import { el, mount, btn } from '../render.js';
import { navigate } from '../router.js';
import { toast } from '../ui.js';

let activeStream = null;
function stopStream() {
  if (activeStream) { activeStream.getTracks().forEach((t) => t.stop()); activeStream = null; }
}

function extractAssetId(text) {
  const m = String(text).match(/taeki\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : null;
}

export async function render(container) {
  stopStream();
  let stopped = false;

  const video = el('video', {
    playsinline: true, muted: true,
    style: { width: '100%', maxWidth: '480px', borderRadius: 'var(--radius)', background: '#000', aspectRatio: '3/4', objectFit: 'cover' },
  });
  // iOS needs the attribute form too
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');

  const status = el('div', { class: 'muted', style: { marginTop: '10px' } }, 'Point the camera at an asset QR code…');

  const cancel = btn('Cancel', () => { stopped = true; stopStream(); navigate('/taeki'); }, { class: 'btn-ghost' });

  mount(container, el('div', {}, [
    el('div', { class: 'page-head' }, el('h2', {}, 'Scan asset')),
    el('div', { class: 'card', style: { textAlign: 'center' } }, [video, status, el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } }, cancel)]),
  ]));

  // stop camera when navigating away
  const onHash = () => { stopped = true; stopStream(); window.removeEventListener('hashchange', onHash); };
  window.addEventListener('hashchange', onHash);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    mount(status.parentNode, el('div', {}, [
      el('div', { class: 'msg err' }, 'Camera not available: ' + (e.message || e)),
      el('p', { class: 'muted', style: { fontSize: '13px' } }, 'Allow camera access, or open the QR with your phone camera instead — it links straight to the asset.'),
      el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '8px' } }, cancel),
    ]));
    return;
  }
  if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
  activeStream = stream;
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay quirk */ }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const detector = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  let jsQR = null;
  if (!detector) {
    try { jsQR = (await import('https://esm.sh/jsqr@1.4.0')).default; }
    catch { status.textContent = 'Could not load the scanner. Use your phone camera on the QR instead.'; }
  }

  function done(text) {
    stopped = true; stopStream();
    const id = extractAssetId(text);
    if (id) navigate('/taeki/' + id);
    else { toast('That QR is not a Bronze Direct asset.', 'err'); navigate('/taeki'); }
  }

  async function tick() {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      let text = null;
      if (detector) {
        try { const codes = await detector.detect(video); if (codes && codes[0]) text = codes[0].rawValue; } catch { /* ignore frame */ }
      } else if (jsQR) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code) text = code.data;
      }
      if (text) { done(text); return; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
