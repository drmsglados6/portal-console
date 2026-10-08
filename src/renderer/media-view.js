const pdfjs = require('pdfjs-dist/build/pdf.mjs');
const assetBase = document.baseURI.replace(/\/app\.asar\//, '/app.asar.unpacked/');

function createMediaView(spec, preferences, callbacks, prepared) {
  const element = document.createElement('section');
  element.className = `pane media-pane media-${spec.kind}`;
  element.dataset.pane = spec.id;
  element.tabIndex = 0;
  const title = document.createElement('div');
  title.className = 'pane-title';
  title.textContent = spec.title || spec.kind.toUpperCase();
  const toolbar = document.createElement('div');
  toolbar.className = 'media-toolbar';
  const host = document.createElement('div');
  host.className = 'media-host';
  const status = document.createElement('div');
  status.className = 'media-status';
  status.setAttribute('aria-live', 'polite');
  element.append(title, toolbar, host, status);
  const state = {
    info: null, sort: preferences.fileSort, descending: preferences.descending,
    scale: 'fit', currentScale: 1, page: 1, pdf: null, task: null, loading: null,
    direction: preferences.pdfArrowDirection, seek: preferences.videoSeekSeconds,
    volume: 0.5, muted: false, volumeStep: preferences.videoVolumeStep, image: null, video: null,
    disposed: false, revision: 0, renderRevision: 0, sortRevision: 0, maximized: false,
    port: null, pdfWorker: null, rejectWorker: null
  };
  let webview = null;
  let sortControl, directionControl, pageControl, zoomLabel;
  const notify = (message) => { if (!state.disposed) status.textContent = message; };
  const run = (promise) => Promise.resolve(promise).catch((error) => {
    if (!state.disposed && !['RenderingCancelledException', 'AbortException'].includes(error.name)) notify(error.message);
  });
  function button(text, action, hint) {
    const control = document.createElement('button');
    control.textContent = text;
    if (hint) control.title = hint;
    control.addEventListener('click', () => run(action()));
    toolbar.append(control);
    return control;
  }
  function toggleMaximize(preserveFocus = false) {
    state.maximized = !state.maximized;
    element.classList.toggle('pane-maximized', state.maximized);
    maxButton.textContent = state.maximized ? 'RESTORE' : 'MAX';
    if (!preserveFocus) element.focus();
    resize();
  }
  const maxButton = button('MAX', toggleMaximize, 'F11: maximize this pane / restore');
  button('CLOSE', () => callbacks.close(spec.id), 'Close this media pane; terminal sessions continue');
  element.addEventListener('pointerdown', (event) => {
    callbacks.focus(spec.id, false);
    if (!event.target.closest('input, select, button, video')) element.focus();
  });
  element.addEventListener('focusin', () => callbacks.focus(spec.id, false));
  function summary(extra = '') {
    if (!state.info || state.disposed) return;
    const info = state.info;
    status.textContent = `${info.name}  ${info.remote ? 'LINK' : `${info.index + 1}/${info.files.length}`}  ${extra}`;
    element.dataset.source = info.source;
    element.dataset.fileIndex = info.index;
    element.dataset.page = state.page;
    element.dataset.sort = `${state.sort}:${state.descending ? 'descending' : 'ascending'}`;
  }
  function releasePdf() {
    const loading = state.loading, worker = state.pdfWorker, port = state.port;
    state.loading = null; state.pdfWorker = null; state.port = null;
    if (state.rejectWorker) { const error = new Error('PDF load canceled'); error.name = 'AbortException'; state.rejectWorker(error); state.rejectWorker = null; }
    const timeout = setTimeout(() => { worker?.destroy(); port?.terminate(); }, 3000);
    Promise.resolve(loading?.destroy()).catch(() => {}).finally(() => { clearTimeout(timeout); worker?.destroy(); port?.terminate(); });
  }
  async function navigate(offset) {
    if (!state.info || state.info.remote) { notify('File navigation requires a local folder.'); return; }
    const index = state.info.index + offset;
    if (index < 0 || index >= state.info.files.length) { notify(offset < 0 ? 'First file in folder.' : 'Last file in folder.'); return; }
    const revision = state.revision + 1;
    try { await load(state.info.files[index]); }
    catch (error) { if (revision === state.revision) throw error; }
  }
  async function changeSort(sort = state.sort, descending = state.descending) {
    if (!state.info || state.info.remote) { notify('Sorting applies to local folders.'); return; }
    state.sort = sort; state.descending = descending;
    sortControl.value = sort;
    reverseButton.textContent = descending ? 'DESC' : 'ASC';
    const revision = ++state.sortRevision;
    const source = state.info.source;
    const info = await window.portalConsole.resolveMedia({ kind: spec.kind, source, sort, descending });
    if (state.disposed || revision !== state.sortRevision || source !== state.info.source) return;
    state.info = info;
    summary(`SORT ${sort} ${descending ? 'DESC' : 'ASC'}`);
  }
  let reverseButton;
  if (spec.kind !== 'web') {
    button('PREV FILE', () => navigate(-1), spec.kind === 'image' ? 'Left' : 'Ctrl+Left');
    button('NEXT FILE', () => navigate(1), spec.kind === 'image' ? 'Right' : 'Ctrl+Right');
    sortControl = document.createElement('select');
    sortControl.setAttribute('aria-label', 'File ordering');
    for (const value of ['name', 'modified', 'size']) {
      const option = document.createElement('option'); option.value = value; option.textContent = value.toUpperCase(); sortControl.append(option);
    }
    sortControl.value = state.sort;
    sortControl.addEventListener('change', () => run(changeSort(sortControl.value)));
    toolbar.append(sortControl);
    reverseButton = button(state.descending ? 'DESC' : 'ASC', () => changeSort(state.sort, !state.descending), 'Shift+S: reverse ordering');
  }
  function imageSize() {
    const image = state.image;
    if (!image?.naturalWidth) return;
    const availableWidth = Math.max(1, host.clientWidth - 16);
    const availableHeight = Math.max(1, host.clientHeight - 16);
    const scale = state.scale === 'fit' ? Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight) : state.scale;
    state.currentScale = scale;
    image.style.width = `${Math.max(1, image.naturalWidth * scale)}px`;
    image.style.height = `${Math.max(1, image.naturalHeight * scale)}px`;
    zoomLabel.textContent = state.scale === 'fit' ? 'FIT' : `${Math.round(scale * 100)}%`;
    summary('LEFT/RIGHT FILE  F FIT  1 ACTUAL  +/- ZOOM  S SORT  SHIFT+S REVERSE  F11 MAX');
  }
  function zoom(delta) {
    const current = state.scale === 'fit' ? state.currentScale : state.scale;
    state.scale = Math.max(0.05, Math.min(Math.max(8, current), current * (delta > 0 ? 1.25 : 0.8)));
    if (spec.kind === 'image') imageSize();
    else run(renderPage());
  }
  async function renderPage() {
    if (!state.pdf || state.disposed) return;
    const revision = ++state.renderRevision;
    const document = state.pdf;
    const previous = state.task;
    previous?.cancel();
    if (previous) await previous.promise.catch(() => {});
    const page = await document.getPage(state.page);
    if (state.disposed || revision !== state.renderRevision || document !== state.pdf) return;
    const normal = page.getViewport({ scale: 1 });
    let scale = state.scale === 'fit' ? Math.min(Math.max(1, host.clientWidth - 20) / normal.width, Math.max(1, host.clientHeight - 20) / normal.height) : state.scale;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(scale, Math.sqrt(16000000 / (normal.width * normal.height * ratio * ratio)));
    state.currentScale = scale;
    const viewport = page.getViewport({ scale });
    const canvas = host.querySelector('canvas');
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    state.task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
    await state.task.promise;
    if (revision !== state.renderRevision || state.disposed) return;
    pageControl.value = state.page; pageControl.max = document.numPages;
    summary(`PAGE ${state.page}/${document.numPages}  ${state.direction.toUpperCase()}  ARROWS PAGE  CTRL+LEFT/RIGHT FILE  D DIRECTION  F11 MAX`);
  }
  function changePage(offset) {
    if (!state.pdf) return;
    state.page = Math.max(1, Math.min(state.pdf.numPages, state.page + offset));
    return renderPage();
  }
  function setDirection(value) {
    state.direction = value; directionControl.value = value;
    return renderPage();
  }
  if (spec.kind === 'image' || spec.kind === 'pdf') {
    button('FIT', () => { state.scale = 'fit'; return spec.kind === 'image' ? imageSize() : renderPage(); });
    button('100%', () => { state.scale = 1; return spec.kind === 'image' ? imageSize() : renderPage(); });
    button('-', () => zoom(-1)); button('+', () => zoom(1));
    if (spec.kind === 'image') { zoomLabel = document.createElement('span'); toolbar.append(zoomLabel); }
  }
  if (spec.kind === 'pdf') {
    button('PREV PAGE', () => changePage(-1)); button('NEXT PAGE', () => changePage(1));
    pageControl = document.createElement('input'); pageControl.type = 'number'; pageControl.min = 1; pageControl.value = 1;
    pageControl.setAttribute('aria-label', 'PDF page');
    pageControl.addEventListener('change', () => {
      if (state.pdf) { state.page = Math.max(1, Math.min(state.pdf.numPages, Number(pageControl.value) || 1)); run(renderPage()); }
    });
    toolbar.append(pageControl);
    directionControl = document.createElement('select'); directionControl.setAttribute('aria-label', 'PDF arrow direction');
    for (const [value, label] of [['ltr', 'LTR: RIGHT NEXT'], ['rtl', 'RTL: LEFT NEXT']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; directionControl.append(option);
    }
    directionControl.value = state.direction;
    directionControl.addEventListener('change', () => run(setDirection(directionControl.value)));
    toolbar.append(directionControl);
  }
  if (spec.kind === 'video') {
    const seek = document.createElement('input'); seek.type = 'number'; seek.min = 0.1; seek.max = 3600; seek.step = 0.1; seek.value = state.seek;
    seek.setAttribute('aria-label', 'Video seek seconds');
    seek.addEventListener('change', () => { state.seek = Math.max(0.1, Math.min(3600, Number(seek.value) || preferences.videoSeekSeconds)); seek.value = state.seek; });
    toolbar.append(seek);
  }
  async function load(source, initial) {
    const revision = ++state.revision;
    notify('LOADING...');
    const info = initial || await window.portalConsole.resolveMedia({ kind: spec.kind, source, sort: state.sort, descending: state.descending });
    if (state.disposed || revision !== state.revision) return;
    state.renderRevision += 1;
    state.task?.cancel();
    releasePdf();
    state.pdf = null;
    if (state.video) { state.video.pause(); state.video.removeAttribute('src'); state.video.load(); }
    state.image = null; state.video = null;
    state.info = info;
    if (sortControl) { sortControl.disabled = info.remote; reverseButton.disabled = info.remote; }
    host.replaceChildren();
    if (spec.kind === 'image') {
      const stage = document.createElement('div'); stage.className = 'media-stage';
      const image = document.createElement('img'); image.alt = info.name; state.image = image;
      image.addEventListener('load', () => { if (state.image === image) imageSize(); });
      image.addEventListener('error', () => { if (state.image === image) notify('Image could not be decoded.'); });
      image.src = info.url; stage.append(image); host.append(stage);
    } else if (spec.kind === 'pdf') {
      const stage = document.createElement('div'); stage.className = 'media-stage'; stage.append(document.createElement('canvas')); host.append(stage);
      const bytes = await window.portalConsole.pdfData(info.source);
      if (state.disposed || revision !== state.revision) return;
      const port = new Worker(new URL('pdf-worker.js', assetBase));
      state.port = port;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('PDF worker did not start')), 10000);
        state.rejectWorker = (error) => { clearTimeout(timer); reject(error); };
        port.addEventListener('message', (event) => { if (event.data?.action === 'ready') { clearTimeout(timer); if (state.port === port) state.rejectWorker = null; resolve(); } });
        port.addEventListener('error', (event) => { clearTimeout(timer); if (state.port === port) state.rejectWorker = null; reject(new Error(event.message || 'PDF worker failed')); });
      });
      if (state.disposed || revision !== state.revision) return;
      state.pdfWorker = new pdfjs.PDFWorker({ port });
      state.loading = pdfjs.getDocument({ worker: state.pdfWorker, data: new Uint8Array(bytes), isEvalSupported: false, cMapUrl: new URL('pdf/cmaps/', assetBase).href,
        cMapPacked: true, standardFontDataUrl: new URL('pdf/standard_fonts/', assetBase).href, wasmUrl: new URL('pdf/wasm/', assetBase).href });
      const pdf = await state.loading.promise;
      if (state.disposed || revision !== state.revision) { pdf.destroy(); return; }
      state.pdf = pdf; state.page = 1;
      await renderPage();
    } else if (spec.kind === 'video') {
      const video = document.createElement('video'); video.controls = true; video.controlsList = 'nofullscreen'; video.preload = 'metadata';
      video.volume = state.volume; video.muted = state.muted; state.video = video;
      video.addEventListener('volumechange', () => { if (state.video !== video) return; state.volume = video.volume; state.muted = video.muted; summary(`VOL ${Math.round(video.volume * 100)}%${video.muted ? ' MUTED' : ''}  LEFT/RIGHT SEEK ${state.seek}s  UP/DOWN VOLUME  CTRL+LEFT/RIGHT FILE  SPACE PLAY  F11 MAX`); });
      video.addEventListener('loadedmetadata', () => { if (state.video === video) summary(`LEFT/RIGHT SEEK ${state.seek}s  UP/DOWN VOLUME  CTRL+LEFT/RIGHT FILE  SPACE PLAY  F11 MAX`); });
      video.addEventListener('error', () => { if (state.video === video) notify('Video could not be decoded. Codec support depends on Electron; try MP4 or WebM.'); });
      video.src = info.url; host.append(video);
    } else {
      webview = document.createElement('webview'); webview.setAttribute('webpreferences', 'sandbox=yes,nodeIntegration=no,contextIsolation=yes');
      const address = document.createElement('input'); address.type = 'url'; address.value = info.url; address.setAttribute('aria-label', 'Web address');
      button('BACK', () => { if (webview.canGoBack()) webview.goBack(); });
      button('FORWARD', () => { if (webview.canGoForward()) webview.goForward(); });
      button('RELOAD', () => webview.reload());
      address.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.stopPropagation();
        try {
          const destination = new URL(address.value);
          if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Enter a complete http(s) URL');
          webview.loadURL(destination.href); address.setCustomValidity('');
        } catch (error) { address.setCustomValidity(error.message); address.reportValidity(); }
      });
      address.addEventListener('input', () => address.setCustomValidity(''));
      webview.addEventListener('did-navigate', (event) => { address.value = event.url; });
      webview.addEventListener('did-fail-load', (event) => { if (event.errorCode !== -3) notify('Web page failed to load.'); });
      webview.src = info.url; toolbar.append(address); host.append(webview);
      summary('INTERNAL WEB VIEW  F11 MAX  Separate from the OS browser profile/extensions.');
    }
  }
  function resize() {
    if (spec.kind === 'image') imageSize();
    else if (spec.kind === 'pdf') run(renderPage());
  }
  let resizeTimer;
  const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });
  observer.observe(host);
  function handleKey(event) {
    const key = event.key;
    if (key === 'F11') { toggleMaximize(); return true; }
    if (spec.kind === 'web') return false;
    if (event.ctrlKey && (key === 'ArrowLeft' || key === 'ArrowRight')) { run(navigate(key === 'ArrowLeft' ? -1 : 1)); return true; }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (key.toLowerCase() === 's') {
      const sorts = ['name', 'modified', 'size'];
      run(changeSort(event.shiftKey ? state.sort : sorts[(sorts.indexOf(state.sort) + 1) % sorts.length], event.shiftKey ? !state.descending : state.descending));
    } else if (spec.kind === 'image' && (key === 'ArrowLeft' || key === 'ArrowRight')) run(navigate(key === 'ArrowLeft' ? -1 : 1));
    else if ((spec.kind === 'image' || spec.kind === 'pdf') && ['+', '=', '-'].includes(key)) zoom(key === '-' ? -1 : 1);
    else if ((spec.kind === 'image' || spec.kind === 'pdf') && (key.toLowerCase() === 'f' || key === '1')) {
      state.scale = key === '1' ? 1 : 'fit'; resize();
    } else if (spec.kind === 'pdf') {
      if (key === 'ArrowUp' || key === 'PageUp') run(changePage(-1));
      else if (key === 'ArrowDown' || key === 'PageDown') run(changePage(1));
      else if (key === 'ArrowLeft' || key === 'ArrowRight') run(changePage((key === 'ArrowRight' ? 1 : -1) * (state.direction === 'ltr' ? 1 : -1)));
      else if (key.toLowerCase() === 'd') run(setDirection(state.direction === 'ltr' ? 'rtl' : 'ltr'));
      else return false;
    } else if (spec.kind === 'video' && state.video) {
      const video = state.video;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (video.readyState >= 1) {
          const end = Number.isFinite(video.duration) ? video.duration : video.seekable.length ? video.seekable.end(video.seekable.length - 1) : Infinity;
          video.currentTime = Math.max(0, Math.min(end, video.currentTime + (key === 'ArrowRight' ? state.seek : -state.seek)));
        }
      } else if (key === 'ArrowUp' || key === 'ArrowDown') video.volume = Math.max(0, Math.min(1, video.volume + (key === 'ArrowUp' ? state.volumeStep : -state.volumeStep)));
      else if (key === ' ') { if (video.paused) run(video.play()); else video.pause(); }
      else return false;
    } else return false;
    return true;
  }
  const ready = load(spec.source, prepared).catch((error) => { if (state.revision === 1 && error.name !== 'AbortException') notify(`COULD NOT OPEN ${spec.kind.toUpperCase()}: ${error.message}`); });
  return { spec, element, ready, handleKey, toggleMaximize, restoreMaximize: () => { if (state.maximized) toggleMaximize(true); },
    focus: () => { if (webview?.isConnected) webview.focus(); else element.focus(); },
    guestId: () => { try { return webview?.getWebContentsId(); } catch { return null; } },
    dispose: () => {
      state.disposed = true; state.revision += 1; state.renderRevision += 1;
      clearTimeout(resizeTimer); observer.disconnect(); state.task?.cancel(); releasePdf();
      if (state.video) { state.video.pause(); state.video.removeAttribute('src'); state.video.load(); }
      element.remove();
    }
  };
}

module.exports = { createMediaView };
