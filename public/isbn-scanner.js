// Quagga2 scanner integration. Decoder settings match the standalone diagnostic.
(() => {
  'use strict';
  const input = document.getElementById('isbnInput');
  const lookup = document.getElementById('isbnLookup');
  const category = document.getElementById('category');
  const row = input?.closest('.isbn-row');
  if (!row || !lookup || !category) return;
  const panel = document.createElement('section');
  panel.className = 'isbn-scanner';
  panel.innerHTML = `
    <div class="isbn-scan-actions">
      <button type="button" id="isbnCamera" autocomplete="off">Scan barcode</button>
      <button type="button" id="isbnPhoto" autocomplete="off">Scan from photo</button>
      <button type="button" id="isbnStop" autocomplete="off" hidden>Close scanner</button>
    </div>
    <input type="file" id="isbnBarcodePhoto" accept="image/*" hidden>
    <div id="isbnReader" hidden><video autoplay muted playsinline style="display:block;width:100%;height:auto"></video></div>
    <p id="isbnScanStatus" role="status" aria-live="polite"></p>`;
  row.after(panel);
  const $ = id => panel.querySelector('#' + id);
  const Q = window.Quagga?.default || window.Quagga;
  const camera = $('isbnCamera'), photo = $('isbnPhoto'), stop = $('isbnStop');
  const file = $('isbnBarcodePhoto'), reader = $('isbnReader'), video = reader.querySelector('video'), status = $('isbnScanStatus');
  let stream = null, run = 0, busy = false, live = false, fatal = false;
  function note(s) { console.debug('[ISBN scanner]', s); }
  function controls() {
    camera.disabled = photo.disabled = busy || live || fatal;
    stop.hidden = !(busy || live);
    stop.disabled = !(busy || live);
  }
  function close() {
    ++run; live = false;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    video.srcObject = null; reader.hidden = true; controls();
  }
  function valid(code) { return /^97[89]\d{10}$/.test(code) && [...code].reduce((sum,d,i)=>sum+Number(d)*(i%2?3:1),0)%10===0; }
  function applyCode(code) {
    if (category.value !== 'textbooks') return;
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    status.textContent = 'ISBN captured: ' + code;
    if (lookup.disabled) status.textContent += '. Select Look up when the current request finishes.';
    else lookup.click();
  }
  if (typeof Q?.decodeSingle !== 'function') {
    fatal = true; controls(); status.textContent = 'Barcode library unavailable. Reload the page or enter the ISBN manually.'; return;
  }
  controls();
  function decode(canvas, locate, label, verbose) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if(done)return; done=true; fatal=true; reject(new Error('Decoder timed out. Reload the test page.')); }, 12000);
      try {
        Q.decodeSingle({src:canvas.toDataURL('image/png'),numOfWorkers:0,inputStream:{size:0},locate,
          locator:{halfSample:false,patchSize:'small'},decoder:{readers:['ean_reader']}}, result => {
          if(done)return; done=true; clearTimeout(timer);
          const code = String(result?.codeResult?.code || '');
          if(verbose || code) note(label + ': ' + (code || 'no barcode') + (valid(code) ? ' (valid ISBN)' : ''));
          resolve(valid(code) ? code : null);
        });
      } catch(e) { if(done)return; done=true;clearTimeout(timer);reject(e); }
    });
  }
  function crop(source, region) {
    const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
    const [x,y,rw,rh] = region; const sw = Math.max(1,Math.floor(w*rw)), sh = Math.max(1,Math.floor(h*rh));
    const scale = Math.min(3, 1200 / Math.max(sw,sh));
    const dw = Math.max(1,Math.round(sw*scale)), dh = Math.max(1,Math.round(sh*scale));
    const pad = Math.max(18, Math.round(dw*.06)); const c = document.createElement('canvas'); c.width=dw+pad*2;c.height=dh+pad*2;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;
    ctx.drawImage(source,Math.floor(w*x),Math.floor(h*y),sw,sh,pad,pad,dw,dh);return c;
  }
  async function attempt(source, id, isLive) {
    const regions = isLive ? [[0,0,1,1],[.08,.30,.84,.40]] : [[0,0,1,1],[.08,.18,.84,.64],[.10,.19,.55,.63],[0,.17,.67,.68],[.08,.32,.84,.36],[.33,.17,.67,.68]];
    for(let i=0;i<regions.length;i++) {
      if(id!==run)return null; const c=crop(source,regions[i]);
      for(const locate of [true,false]) { if(id!==run)return null; const code=await decode(c,locate,`Region ${i+1}, locate=${locate}`,!isLive); if(code)return code; }
    } return null;
  }
  photo.addEventListener('click', () => { if (!busy && !live && !fatal) file.click(); });
  file.addEventListener('change', async () => {
    const selected = file.files[0]; file.value = '';
    if (!selected || busy || live || fatal || category.value !== 'textbooks') return;
    if (selected.size > 20 * 1024 * 1024) { status.textContent = 'Choose an image smaller than 20 MB.'; return; }
    busy = true; controls(); const id = ++run; status.textContent = 'Decoding photo…';
    const url = URL.createObjectURL(selected); const img = new Image();
    try {
      img.src = url; await img.decode();
      const code = await attempt(img, id, false);
      if (id !== run) return;
      if (code) applyCode(code);
      else status.textContent = 'No valid ISBN found. Try a close-up of the barcode or enter the ISBN manually.';
    } catch(e) { if (id === run) status.textContent = 'Photo error: ' + String(e); console.error(e); }
    finally { URL.revokeObjectURL(url); busy = false; controls(); }
  });
  camera.addEventListener('click', async () => {
    if (busy || live || fatal || category.value !== 'textbooks') return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status.textContent = 'Camera requires HTTPS or localhost. Use a photo or enter ISBN manually.'; return; }
    live = true; busy = true; controls(); const id = ++run; status.textContent = 'Opening camera…';
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      if (id !== run) { acquired.getTracks().forEach(t=>t.stop()); return; }
      stream = acquired; video.srcObject = stream; reader.hidden = false; await video.play();
      if (id !== run) return;
      for (let frame = 1; id === run; frame++) {
        status.textContent = `Hold the barcode horizontally in the centre — attempt ${frame}`;
        const code = await attempt(video, id, true);
        if (id !== run) return;
        if (code) { close(); applyCode(code); return; }
        await new Promise(r=>setTimeout(r,400));
      }
    } catch(e) { if (id === run) { close(); status.textContent = 'Camera error: ' + String(e); } console.error(e); }
    finally { busy = false; controls(); }
  });
  stop.addEventListener('click', () => { close(); status.textContent = 'Scanner closed.'; });
  category.addEventListener('change', () => { if (category.value !== 'textbooks') { close(); status.textContent = ''; } });
  window.addEventListener('pageshow', () => {
    setTimeout(controls, 0);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && live) { close(); status.textContent = 'Camera stopped.'; } });
})();
