const MIN_CROP_SIZE = 0.12;

const state = {
  wall: {
    width: 2400,
    height: 1400,
    innerMargin: 120,
    unit: 'mm',
    backgroundImage: null,
    sourceImage: null,
    cropSelection: null,
  },
  frames: [],
  nextId: 1,
  layout: null,
  cameraStream: null,
  pendingCrop: null,
  cropInteraction: null,
  lastMessage: {
    type: 'info',
    text: 'Ready. Enter the wall size, take a photo or choose one from your gallery, then add picture frames.',
  },
};

const els = {
  wallForm: document.getElementById('wall-form'),
  frameForm: document.getElementById('frame-form'),
  wallWidth: document.getElementById('wall-width'),
  wallHeight: document.getElementById('wall-height'),
  innerMargin: document.getElementById('inner-margin'),
  wallImageCamera: document.getElementById('wall-image-camera'),
  wallImageGallery: document.getElementById('wall-image-gallery'),
  takeWallPhoto: document.getElementById('take-wall-photo'),
  chooseWallPhoto: document.getElementById('choose-wall-photo'),
  clearWallImage: document.getElementById('clear-wall-image'),
  openCamera: document.getElementById('open-camera'),
  editWallArea: document.getElementById('edit-wall-area'),
  closeCamera: document.getElementById('close-camera'),
  capturePhoto: document.getElementById('capture-photo'),
  cameraPanel: document.getElementById('camera-panel'),
  cameraVideo: document.getElementById('camera-video'),
  cameraCanvas: document.getElementById('camera-canvas'),
  cropPanel: document.getElementById('crop-panel'),
  cropStage: document.getElementById('crop-stage'),
  cropImage: document.getElementById('crop-image'),
  cropSelection: document.getElementById('crop-selection'),
  applyCrop: document.getElementById('apply-crop'),
  resetCrop: document.getElementById('reset-crop'),
  cancelCrop: document.getElementById('cancel-crop'),
  clearFrames: document.getElementById('clear-frames'),
  frameName: document.getElementById('frame-name'),
  frameWidth: document.getElementById('frame-width'),
  frameHeight: document.getElementById('frame-height'),
  statusBanner: document.getElementById('status-banner'),
  frameList: document.getElementById('frame-list'),
  wallSummary: document.getElementById('wall-summary'),
  frameCountCopy: document.getElementById('frame-count-copy'),
  wallViewport: document.getElementById('wall-viewport'),
  wallCanvas: document.getElementById('wall-canvas'),
  usableArea: document.getElementById('usable-area'),
  frameLayer: document.getElementById('frame-layer'),
};

function formatNumber(value) {
  const rounded = Number(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1).replace(/\.0$/, '');
}

function areaLabel(width, height, unit) {
  return `${formatNumber(width)} × ${formatNumber(height)} ${unit}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cloneSelection(selection) {
  return {
    x: selection.x,
    y: selection.y,
    w: selection.w,
    h: selection.h,
  };
}

function getDefaultCropSelection() {
  return {
    x: 0.08,
    y: 0.08,
    w: 0.84,
    h: 0.84,
  };
}

function showMessage(text, type = 'info') {
  state.lastMessage = { text, type };
  els.statusBanner.textContent = text;
  els.statusBanner.classList.toggle('error', type === 'error');
}

function computeLayout(frames, wall) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;

  if (usableWidth <= 0 || usableHeight <= 0) {
    return {
      ok: false,
      reason: 'The inner margin is too large for the selected wall dimensions.',
    };
  }

  for (const frame of frames) {
    if (frame.width > usableWidth || frame.height > usableHeight) {
      return {
        ok: false,
        reason: `“${frame.name}” is too large to fit inside the usable wall area.`,
      };
    }
  }

  if (!frames.length) {
    return {
      ok: true,
      usableWidth,
      usableHeight,
      placements: new Map(),
      rows: [],
      minGap: Math.min(usableWidth, usableHeight),
      rowCount: 0,
    };
  }

  const ordered = [...frames].sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height;
    if (areaDiff !== 0) return areaDiff;
    if (b.height !== a.height) return b.height - a.height;
    return a.id - b.id;
  });

  const n = ordered.length;
  const segWidth = Array.from({ length: n }, () => Array(n).fill(0));
  const segHeight = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    let runningWidth = 0;
    let runningHeight = 0;
    for (let j = i; j < n; j += 1) {
      runningWidth += ordered[j].width;
      runningHeight = Math.max(runningHeight, ordered[j].height);
      segWidth[i][j] = runningWidth;
      segHeight[i][j] = runningHeight;
    }
  }

  let best = null;

  for (let rows = 1; rows <= n; rows += 1) {
    const dp = Array.from({ length: n + 1 }, () => Array(rows + 1).fill(Number.POSITIVE_INFINITY));
    const parent = Array.from({ length: n + 1 }, () => Array(rows + 1).fill(null));
    dp[0][0] = 0;

    for (let i = 1; i <= n; i += 1) {
      for (let r = 1; r <= rows; r += 1) {
        for (let start = r - 1; start <= i - 1; start += 1) {
          if (!Number.isFinite(dp[start][r - 1])) continue;
          const rowWidth = segWidth[start][i - 1];
          if (rowWidth > usableWidth) continue;
          const slack = usableWidth - rowWidth;
          const rowHeight = segHeight[start][i - 1];
          const cost = dp[start][r - 1] + slack * slack + rowHeight * 0.001;
          if (cost < dp[i][r]) {
            dp[i][r] = cost;
            parent[i][r] = start;
          }
        }
      }
    }

    if (!Number.isFinite(dp[n][rows])) continue;

    const rowSegments = [];
    let i = n;
    let r = rows;
    while (r > 0) {
      const start = parent[i][r];
      if (start === null || start === undefined) break;
      rowSegments.unshift([start, i - 1]);
      i = start;
      r -= 1;
    }

    if (rowSegments.length !== rows) continue;

    const rowHeights = rowSegments.map(([start, end]) => segHeight[start][end]);
    const totalRowHeight = rowHeights.reduce((sum, value) => sum + value, 0);
    if (totalRowHeight > usableHeight) continue;

    const verticalGap = (usableHeight - totalRowHeight) / (rows + 1);
    let minGap = verticalGap;
    const rowData = rowSegments.map(([start, end], index) => {
      const items = ordered.slice(start, end + 1);
      const rowWidth = segWidth[start][end];
      const rowHeight = rowHeights[index];
      const horizontalGap = (usableWidth - rowWidth) / (items.length + 1);
      minGap = Math.min(minGap, horizontalGap);
      return {
        items,
        rowWidth,
        rowHeight,
        horizontalGap,
      };
    });

    const gapBalancePenalty = rowData.reduce((sum, row) => sum + Math.abs(row.horizontalGap - verticalGap), 0);
    const score = minGap * 1000 - gapBalancePenalty;

    if (!best || score > best.score) {
      best = {
        score,
        rows,
        rowData,
        verticalGap,
        usableWidth,
        usableHeight,
      };
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: 'No valid evenly spaced layout remains in the usable wall area.',
    };
  }

  const placements = new Map();
  let currentY = wall.innerMargin + best.verticalGap;

  best.rowData.forEach((row, rowIndex) => {
    let currentX = wall.innerMargin + row.horizontalGap;
    row.items.forEach((frame) => {
      const yOffset = (row.rowHeight - frame.height) / 2;
      placements.set(frame.id, {
        x: currentX,
        y: currentY + yOffset,
        width: frame.width,
        height: frame.height,
        rowIndex,
      });
      currentX += frame.width + row.horizontalGap;
    });
    currentY += row.rowHeight + best.verticalGap;
  });

  return {
    ok: true,
    usableWidth,
    usableHeight,
    placements,
    rows: best.rowData,
    minGap: best.score / 1000,
    rowCount: best.rows,
  };
}

function applyWallSettings(nextWall, options = {}) {
  const layout = computeLayout(state.frames, nextWall);
  if (!layout.ok) {
    showMessage(layout.reason, 'error');
    return false;
  }

  state.wall = {
    ...nextWall,
    backgroundImage:
      options.keepExistingImage === false ? null : options.backgroundImage ?? state.wall.backgroundImage,
    sourceImage:
      options.keepExistingImage === false ? null : options.sourceImage ?? state.wall.sourceImage,
    cropSelection:
      options.keepExistingImage === false ? null : options.cropSelection ?? state.wall.cropSelection,
  };
  state.layout = layout;
  render();
  showMessage('Wall settings applied.', 'info');
  return true;
}

function handleWallFormSubmit(event) {
  event.preventDefault();

  const nextWall = {
    width: Number(els.wallWidth.value),
    height: Number(els.wallHeight.value),
    innerMargin: Number(els.innerMargin.value),
    unit: 'mm',
  };

  if ([nextWall.width, nextWall.height, nextWall.innerMargin].some((value) => Number.isNaN(value))) {
    showMessage('Enter valid numeric wall values.', 'error');
    return;
  }

  if (nextWall.width <= 0 || nextWall.height <= 0 || nextWall.innerMargin < 0) {
    showMessage('Wall width and height must be positive, and the inner margin cannot be negative.', 'error');
    return;
  }

  applyWallSettings(nextWall);
}

function showCropPanel() {
  els.cropPanel.classList.remove('hidden');
}

function hideCropPanel() {
  els.cropPanel.classList.add('hidden');
  state.cropInteraction = null;
}

function updateEditWallAreaButton() {
  const hasPhoto = Boolean(state.wall.sourceImage || state.pendingCrop?.dataUrl);
  els.editWallArea.classList.toggle('hidden', !hasPhoto);
}

function renderCropSelection() {
  if (!state.pendingCrop) return;
  const { x, y, w, h } = state.pendingCrop.selection;
  els.cropSelection.style.left = `${x * 100}%`;
  els.cropSelection.style.top = `${y * 100}%`;
  els.cropSelection.style.width = `${w * 100}%`;
  els.cropSelection.style.height = `${h * 100}%`;
}

function openCropEditor(dataUrl, sourceLabel = 'photo', selection = null) {
  state.pendingCrop = {
    dataUrl,
    sourceLabel,
    selection: cloneSelection(selection ?? getDefaultCropSelection()),
  };
  els.cropImage.src = dataUrl;
  showCropPanel();
  renderCropSelection();
  updateEditWallAreaButton();
  showMessage(`Adjust the wall-area overlay for the ${sourceLabel}, then apply the selected wall area.`, 'info');
}

function closeCropEditor() {
  hideCropPanel();
  state.pendingCrop = null;
  updateEditWallAreaButton();
}

function loadWallImageFile(file, sourceLabel = 'photo') {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    openCropEditor(String(reader.result), sourceLabel);
  };
  reader.readAsDataURL(file);
}

function handleWallImageChange(event) {
  const file = event.target.files?.[0];
  const sourceLabel = event.target === els.wallImageCamera ? 'camera photo' : 'gallery photo';
  loadWallImageFile(file, sourceLabel);
}

function triggerCameraInput() {
  els.wallImageCamera.click();
}

function triggerGalleryInput() {
  els.wallImageGallery.click();
}

function clearWallImage() {
  state.wall.backgroundImage = null;
  state.wall.sourceImage = null;
  state.wall.cropSelection = null;
  state.pendingCrop = null;
  els.wallImageCamera.value = '';
  els.wallImageGallery.value = '';
  hideCropPanel();
  updateEditWallAreaButton();
  renderWall();
  showMessage('Wall photo removed.', 'info');
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage('Live camera is not supported in this browser. Use the photo input instead.', 'error');
    return;
  }

  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    });

    state.cameraStream = stream;
    els.cameraVideo.srcObject = stream;
    els.cameraPanel.classList.remove('hidden');
    await els.cameraVideo.play();
    showMessage('Live preview camera opened. On phones, the main Take wall photo button is usually faster.', 'info');
  } catch (error) {
    const message = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'CameraError';
    if (message === 'NotAllowedError' || message === 'SecurityError') {
      showMessage('Camera permission was denied. Allow camera access in the browser and try again.', 'error');
      return;
    }
    if (message === 'NotFoundError' || message === 'OverconstrainedError') {
      showMessage('No usable camera was found on this device.', 'error');
      return;
    }
    showMessage('Could not open the live camera in this browser. Use the photo input instead.', 'error');
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  els.cameraVideo.pause();
  els.cameraVideo.srcObject = null;
  els.cameraPanel.classList.add('hidden');
}

function capturePhoto() {
  const videoWidth = els.cameraVideo.videoWidth;
  const videoHeight = els.cameraVideo.videoHeight;

  if (!videoWidth || !videoHeight) {
    showMessage('The camera feed is not ready yet. Wait a moment and try again.', 'error');
    return;
  }

  els.cameraCanvas.width = videoWidth;
  els.cameraCanvas.height = videoHeight;
  const ctx = els.cameraCanvas.getContext('2d');
  ctx.drawImage(els.cameraVideo, 0, 0, videoWidth, videoHeight);
  const dataUrl = els.cameraCanvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  openCropEditor(dataUrl, 'camera photo');
}

function editWallArea() {
  if (!state.wall.sourceImage) {
    showMessage('Upload or capture a wall photo first.', 'error');
    return;
  }
  openCropEditor(state.wall.sourceImage, 'photo', state.wall.cropSelection ?? getDefaultCropSelection());
}

function resetCropSelection() {
  if (!state.pendingCrop) return;
  state.pendingCrop.selection = getDefaultCropSelection();
  renderCropSelection();
}

function applyPendingCrop() {
  if (!state.pendingCrop) return;
  if (!els.cropImage.complete || !els.cropImage.naturalWidth || !els.cropImage.naturalHeight) {
    showMessage('The photo is still loading. Wait a moment and try again.', 'error');
    return;
  }

  const selection = state.pendingCrop.selection;
  const sourceWidth = els.cropImage.naturalWidth;
  const sourceHeight = els.cropImage.naturalHeight;
  const sx = Math.round(selection.x * sourceWidth);
  const sy = Math.round(selection.y * sourceHeight);
  const sw = Math.max(1, Math.round(selection.w * sourceWidth));
  const sh = Math.max(1, Math.round(selection.h * sourceHeight));

  els.cameraCanvas.width = sw;
  els.cameraCanvas.height = sh;
  const ctx = els.cameraCanvas.getContext('2d');
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(els.cropImage, sx, sy, sw, sh, 0, 0, sw, sh);
  const croppedDataUrl = els.cameraCanvas.toDataURL('image/jpeg', 0.92);

  state.wall.sourceImage = state.pendingCrop.dataUrl;
  els.wallImageCamera.value = '';
  els.wallImageGallery.value = '';
  state.wall.cropSelection = cloneSelection(selection);
  state.wall.backgroundImage = croppedDataUrl;
  hideCropPanel();
  state.pendingCrop = null;
  updateEditWallAreaButton();
  renderWall();
  showMessage('Selected wall area applied as the background.', 'info');
}

function beginCropInteraction(event) {
  if (!state.pendingCrop) return;
  const target = event.target;
  const isHandle = target instanceof HTMLElement && target.dataset.handle;
  const isSelection = target === els.cropSelection || els.cropSelection.contains(target);

  if (!isHandle && !isSelection) return;

  event.preventDefault();
  event.stopPropagation();

  const mode = isHandle ? `resize-${target.dataset.handle}` : 'move';
  state.cropInteraction = {
    pointerId: event.pointerId,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    startSelection: cloneSelection(state.pendingCrop.selection),
  };

  els.cropStage.setPointerCapture?.(event.pointerId);
}

function updateCropInteraction(event) {
  if (!state.cropInteraction || !state.pendingCrop) return;
  if (event.pointerId !== state.cropInteraction.pointerId) return;

  const stageRect = els.cropStage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;

  const dx = (event.clientX - state.cropInteraction.startX) / stageRect.width;
  const dy = (event.clientY - state.cropInteraction.startY) / stageRect.height;
  const start = state.cropInteraction.startSelection;
  const selection = cloneSelection(start);

  if (state.cropInteraction.mode === 'move') {
    selection.x = clamp(start.x + dx, 0, 1 - start.w);
    selection.y = clamp(start.y + dy, 0, 1 - start.h);
  } else {
    const handle = state.cropInteraction.mode.replace('resize-', '');
    const left = start.x;
    const top = start.y;
    const right = start.x + start.w;
    const bottom = start.y + start.h;

    let newLeft = left;
    let newTop = top;
    let newRight = right;
    let newBottom = bottom;

    if (handle.includes('w')) {
      newLeft = clamp(left + dx, 0, right - MIN_CROP_SIZE);
    }
    if (handle.includes('e')) {
      newRight = clamp(right + dx, left + MIN_CROP_SIZE, 1);
    }
    if (handle.includes('n')) {
      newTop = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
    }
    if (handle.includes('s')) {
      newBottom = clamp(bottom + dy, top + MIN_CROP_SIZE, 1);
    }

    selection.x = newLeft;
    selection.y = newTop;
    selection.w = newRight - newLeft;
    selection.h = newBottom - newTop;
  }

  state.pendingCrop.selection = selection;
  renderCropSelection();
}

function endCropInteraction(event) {
  if (!state.cropInteraction) return;
  if (event && event.pointerId !== undefined && event.pointerId !== state.cropInteraction.pointerId) return;
  try {
    if (event?.pointerId !== undefined) {
      els.cropStage.releasePointerCapture?.(event.pointerId);
    }
  } catch (error) {
    // no-op
  }
  state.cropInteraction = null;
}

function addFrame(event) {
  event.preventDefault();

  const width = Number(els.frameWidth.value);
  const height = Number(els.frameHeight.value);
  const customName = els.frameName.value.trim();

  if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
    showMessage('Enter valid positive frame dimensions.', 'error');
    return;
  }

  const frame = {
    id: state.nextId,
    name: customName || `Picture ${state.nextId}`,
    width,
    height,
  };

  const nextFrames = [...state.frames, frame];
  const nextLayout = computeLayout(nextFrames, state.wall);

  if (!nextLayout.ok) {
    showMessage(`Cannot add that picture frame. ${nextLayout.reason}`, 'error');
    return;
  }

  state.frames = nextFrames;
  state.layout = nextLayout;
  state.nextId += 1;
  els.frameForm.reset();
  els.frameWidth.value = '300';
  els.frameHeight.value = '400';
  render();
  showMessage(`Added “${frame.name}”. The layout was redistributed evenly.`, 'info');
}

function removeFrame(frameId) {
  state.frames = state.frames.filter((frame) => frame.id !== frameId);
  state.layout = computeLayout(state.frames, state.wall);
  render();
  showMessage('Picture frame removed and layout updated.', 'info');
}

function clearFrames() {
  state.frames = [];
  state.layout = computeLayout(state.frames, state.wall);
  render();
  showMessage('All frames removed.', 'info');
}

function renderSummary() {
  const usableWidth = state.wall.width - state.wall.innerMargin * 2;
  const usableHeight = state.wall.height - state.wall.innerMargin * 2;
  const usableArea = Math.max(usableWidth, 0) * Math.max(usableHeight, 0);
  const usedArea = state.frames.reduce((sum, frame) => sum + frame.width * frame.height, 0);
  const fillPct = usableArea > 0 ? Math.min((usedArea / usableArea) * 100, 100).toFixed(1) : '0.0';

  const layoutLine = state.layout && state.layout.ok
    ? `${state.layout.rowCount || 0} row${state.layout.rowCount === 1 ? '' : 's'} in use`
    : 'No valid layout';

  const photoLine = state.wall.backgroundImage ? 'Wall photo aligned' : 'No wall photo';

  els.wallSummary.innerHTML = `
    <div><strong>Wall:</strong> ${areaLabel(state.wall.width, state.wall.height, state.wall.unit)}</div>
    <div><strong>Inner margin:</strong> ${formatNumber(state.wall.innerMargin)} ${state.wall.unit}</div>
    <div><strong>Usable area:</strong> ${areaLabel(usableWidth, usableHeight, state.wall.unit)}</div>
    <div><strong>Frames:</strong> ${state.frames.length}</div>
    <div><strong>Filled area:</strong> ${fillPct}%</div>
    <div><strong>Layout:</strong> ${layoutLine}</div>
    <div><strong>Photo:</strong> ${photoLine}</div>
  `;
}

function renderFrameList() {
  els.frameCountCopy.textContent = `${state.frames.length} frame${state.frames.length === 1 ? '' : 's'}`;

  if (!state.frames.length) {
    els.frameList.className = 'frame-list empty-state';
    els.frameList.textContent = 'No frames added yet.';
    return;
  }

  els.frameList.className = 'frame-list';
  els.frameList.innerHTML = '';

  state.frames.forEach((frame) => {
    const item = document.createElement('div');
    item.className = 'frame-item';
    item.innerHTML = `
      <div class="frame-meta">
        <strong>${escapeHtml(frame.name)}</strong>
        <span>${areaLabel(frame.width, frame.height, state.wall.unit)}</span>
      </div>
      <button type="button" class="button-secondary" data-remove-id="${frame.id}">Remove</button>
    `;
    els.frameList.appendChild(item);
  });

  els.frameList.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', () => removeFrame(Number(button.dataset.removeId)));
  });
}

function fitWallToViewport() {
  const maxWidth = Math.max(els.wallViewport.clientWidth - 10, 260);
  const maxHeight = Math.max(window.innerHeight * 0.58, 280);
  const scale = Math.min(maxWidth / state.wall.width, maxHeight / state.wall.height);
  return {
    scale,
    width: state.wall.width * scale,
    height: state.wall.height * scale,
  };
}

function renderWall() {
  const { width, height, scale } = fitWallToViewport();
  els.wallCanvas.style.width = `${width}px`;
  els.wallCanvas.style.height = `${height}px`;

  if (state.wall.backgroundImage) {
    els.wallCanvas.classList.add('with-photo');
    els.wallCanvas.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url(${state.wall.backgroundImage})`;
  } else {
    els.wallCanvas.classList.remove('with-photo');
    els.wallCanvas.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.28)), linear-gradient(180deg, #d8d1c9, #c4b8ab)';
  }

  const innerLeft = state.wall.innerMargin * scale;
  const innerTop = state.wall.innerMargin * scale;
  const innerWidth = (state.wall.width - state.wall.innerMargin * 2) * scale;
  const innerHeight = (state.wall.height - state.wall.innerMargin * 2) * scale;

  els.usableArea.style.left = `${innerLeft}px`;
  els.usableArea.style.top = `${innerTop}px`;
  els.usableArea.style.width = `${Math.max(innerWidth, 0)}px`;
  els.usableArea.style.height = `${Math.max(innerHeight, 0)}px`;

  els.frameLayer.innerHTML = '';

  if (!state.layout || !state.layout.ok) return;

  state.frames.forEach((frame) => {
    const placement = state.layout.placements.get(frame.id);
    if (!placement) return;

    const frameEl = document.createElement('div');
    frameEl.className = 'wall-frame';
    frameEl.style.left = `${placement.x * scale}px`;
    frameEl.style.top = `${placement.y * scale}px`;
    frameEl.style.width = `${placement.width * scale}px`;
    frameEl.style.height = `${placement.height * scale}px`;

    const label = document.createElement('span');
    label.textContent = frame.name;
    frameEl.appendChild(label);
    els.frameLayer.appendChild(frameEl);
  });
}

function render() {
  updateEditWallAreaButton();
  renderSummary();
  renderFrameList();
  renderWall();
  if (state.pendingCrop) {
    renderCropSelection();
  }
  showMessage(state.lastMessage.text, state.lastMessage.type);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function init() {
  state.layout = computeLayout(state.frames, state.wall);
  render();

  els.wallForm.addEventListener('submit', handleWallFormSubmit);
  els.wallImageCamera.addEventListener('change', handleWallImageChange);
  els.wallImageGallery.addEventListener('change', handleWallImageChange);
  els.takeWallPhoto.addEventListener('click', triggerCameraInput);
  els.chooseWallPhoto.addEventListener('click', triggerGalleryInput);
  els.openCamera.addEventListener('click', openCamera);
  els.editWallArea.addEventListener('click', editWallArea);
  els.capturePhoto.addEventListener('click', capturePhoto);
  els.closeCamera.addEventListener('click', stopCamera);
  els.clearWallImage.addEventListener('click', clearWallImage);
  els.applyCrop.addEventListener('click', applyPendingCrop);
  els.resetCrop.addEventListener('click', resetCropSelection);
  els.cancelCrop.addEventListener('click', closeCropEditor);
  els.cropSelection.addEventListener('pointerdown', beginCropInteraction);
  els.cropSelection.querySelectorAll('[data-handle]').forEach((handle) => {
    handle.addEventListener('pointerdown', beginCropInteraction);
  });
  els.cropStage.addEventListener('pointermove', updateCropInteraction);
  els.cropStage.addEventListener('pointerup', endCropInteraction);
  els.cropStage.addEventListener('pointercancel', endCropInteraction);
  els.frameForm.addEventListener('submit', addFrame);
  els.clearFrames.addEventListener('click', clearFrames);
  els.cropImage.addEventListener('load', renderCropSelection);

  const resizeObserver = new ResizeObserver(() => {
    renderWall();
    renderCropSelection();
  });
  resizeObserver.observe(els.wallViewport);
  resizeObserver.observe(els.cropStage);
  window.addEventListener('resize', () => {
    renderWall();
    renderCropSelection();
  });
  window.addEventListener('beforeunload', stopCamera);
}

init();
