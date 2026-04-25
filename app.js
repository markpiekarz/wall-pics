const MIN_CROP_SIZE = 0.12;
const STORAGE_KEY = 'wall-picture-planner-v4';
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.84;
const MAX_VISUAL_SEQUENCES = 50000;
const MAX_CANDIDATES_TO_SHOW = 48;

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
  layoutSettings: {
    spacing: 10,
    compact: false,
  },
  frames: [],
  nextId: 1,
  draftFrame: {
    name: 'Picture',
    width: 300,
    height: 400,
    quantity: 1,
  },
  layoutCandidates: [],
  selectedLayoutIndex: 0,
  selectedLayoutKey: null,
  searchStats: null,
  cameraStream: null,
  pendingCrop: null,
  cropInteraction: null,
  lastMessage: {
    type: 'info',
    text: 'Ready. Enter the wall size, spacing, then take a photo or choose one from your gallery.',
  },
};

const els = {
  wallForm: document.getElementById('wall-form'),
  frameForm: document.getElementById('frame-form'),
  wallWidth: document.getElementById('wall-width'),
  wallHeight: document.getElementById('wall-height'),
  innerMargin: document.getElementById('inner-margin'),
  frameSpacing: document.getElementById('frame-spacing'),
  compactLayout: document.getElementById('compact-layout'),
  wallImageCamera: document.getElementById('wall-image-camera'),
  wallImageGallery: document.getElementById('wall-image-gallery'),
  takeWallPhoto: document.getElementById('take-wall-photo'),
  chooseWallPhoto: document.getElementById('choose-wall-photo'),
  clearWallImage: document.getElementById('clear-wall-image'),
  openCamera: document.getElementById('open-camera'),
  editWallArea: document.getElementById('edit-wall-area'),
  closeCamera: document.getElementById('close-camera'),
  capturePhoto: document.getElementById('capture-photo'),
  cameraModal: document.getElementById('camera-modal'),
  cropModal: document.getElementById('crop-modal'),
  cameraVideo: document.getElementById('camera-video'),
  cameraCanvas: document.getElementById('camera-canvas'),
  cropStage: document.getElementById('crop-stage'),
  cropImage: document.getElementById('crop-image'),
  cropSelection: document.getElementById('crop-selection'),
  applyCrop: document.getElementById('apply-crop'),
  resetCrop: document.getElementById('reset-crop'),
  cancelCrop: document.getElementById('cancel-crop'),
  clearFrames: document.getElementById('clear-frames'),
  frameName: document.getElementById('frame-name'),
  frameQuantity: document.getElementById('frame-quantity'),
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
  photoPreviewCard: document.getElementById('photo-preview-card'),
  photoPreviewImage: document.getElementById('photo-preview-image'),
  photoPreviewTitle: document.getElementById('photo-preview-title'),
  photoPreviewMeta: document.getElementById('photo-preview-meta'),
  layoutName: document.getElementById('layout-name'),
  layoutMeta: document.getElementById('layout-meta'),
  layoutProgress: document.getElementById('layout-progress'),
  prevLayout: document.getElementById('prev-layout'),
  nextLayout: document.getElementById('next-layout'),
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getFrameArea(frame) {
  return frame.width * frame.height;
}

function getActiveLayout() {
  return state.layoutCandidates[state.selectedLayoutIndex] ?? state.layoutCandidates[0] ?? null;
}

function updateSelectedLayoutByKey() {
  if (!state.selectedLayoutKey) {
    state.selectedLayoutIndex = 0;
    return;
  }
  const foundIndex = state.layoutCandidates.findIndex((candidate) => candidate.key === state.selectedLayoutKey);
  state.selectedLayoutIndex = foundIndex >= 0 ? foundIndex : 0;
}

function showMessage(text, type = 'info') {
  state.lastMessage = { text, type };
  if (!els.statusBanner) return;
  els.statusBanner.textContent = text;
  els.statusBanner.classList.toggle('error', type === 'error');
}

function syncBodyModalState() {
  const hasOpenModal = !els.cameraModal.classList.contains('hidden') || !els.cropModal.classList.contains('hidden');
  document.body.classList.toggle('modal-open', hasOpenModal);
}

function openModal(modal) {
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();
}

function closeModal(modal) {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  syncBodyModalState();
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
  return { x: 0.03, y: 0.03, w: 0.94, h: 0.94 };
}

function getSuggestedCropSelection(imageWidth, imageHeight) {
  const wallAspect = state.wall.width > 0 && state.wall.height > 0 ? state.wall.width / state.wall.height : 1;
  const imageAspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : wallAspect;
  const inset = 0.02;
  const usableWidth = 1 - inset * 2;
  const usableHeight = 1 - inset * 2;

  if (!Number.isFinite(wallAspect) || wallAspect <= 0 || !Number.isFinite(imageAspect) || imageAspect <= 0) {
    return getDefaultCropSelection();
  }

  let w;
  let h;
  if (imageAspect >= wallAspect) {
    h = usableHeight;
    w = (h * wallAspect) / imageAspect;
  } else {
    w = usableWidth;
    h = (w / wallAspect) * imageAspect;
  }

  w = clamp(w, MIN_CROP_SIZE, 1);
  h = clamp(h, MIN_CROP_SIZE, 1);
  return { x: clamp((1 - w) / 2, 0, 1 - w), y: clamp((1 - h) / 2, 0, 1 - h), w, h };
}

function getCurrentFrameDraft() {
  return {
    name: els.frameName?.value.trim() || state.draftFrame.name || 'Picture',
    width: Number(els.frameWidth?.value) || state.draftFrame.width || 300,
    height: Number(els.frameHeight?.value) || state.draftFrame.height || 400,
    quantity: Math.max(1, Math.floor(Number(els.frameQuantity?.value) || state.draftFrame.quantity || 1)),
  };
}

function getCurrentLayoutSettings() {
  return {
    spacing: Math.max(0, Number(els.frameSpacing?.value) || 0),
    compact: Boolean(els.compactLayout?.checked),
  };
}

function persistState() {
  try {
    const activeLayout = getActiveLayout();
    const payload = {
      version: 6,
      wall: state.wall,
      layoutSettings: state.layoutSettings,
      frames: state.frames,
      nextId: state.nextId,
      selectedLayoutKey: activeLayout?.key ?? state.selectedLayoutKey ?? null,
      draftFrame: getCurrentFrameDraft(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    showMessage('The browser could not save everything locally. Some data may not persist after refresh.', 'error');
  }
}

function persistDraftFrame() {
  state.draftFrame = getCurrentFrameDraft();
  persistState();
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    if (parsed.wall && typeof parsed.wall === 'object') {
      state.wall = {
        width: Number(parsed.wall.width) || 2400,
        height: Number(parsed.wall.height) || 1400,
        innerMargin: Number(parsed.wall.innerMargin) || 120,
        unit: 'mm',
        backgroundImage: typeof parsed.wall.backgroundImage === 'string' ? parsed.wall.backgroundImage : null,
        sourceImage: typeof parsed.wall.sourceImage === 'string' ? parsed.wall.sourceImage : null,
        cropSelection:
          parsed.wall.cropSelection && typeof parsed.wall.cropSelection === 'object'
            ? {
                x: clamp(Number(parsed.wall.cropSelection.x) || 0.03, 0, 1),
                y: clamp(Number(parsed.wall.cropSelection.y) || 0.03, 0, 1),
                w: clamp(Number(parsed.wall.cropSelection.w) || 0.94, MIN_CROP_SIZE, 1),
                h: clamp(Number(parsed.wall.cropSelection.h) || 0.94, MIN_CROP_SIZE, 1),
              }
            : null,
      };
    }

    if (parsed.layoutSettings && typeof parsed.layoutSettings === 'object') {
      state.layoutSettings = {
        spacing: Math.max(0, Number(parsed.layoutSettings.spacing) || 10),
        compact: Boolean(parsed.layoutSettings.compact),
      };
    }

    if (Array.isArray(parsed.frames)) {
      state.frames = parsed.frames
        .filter((frame) => frame && Number(frame.width) > 0 && Number(frame.height) > 0)
        .map((frame, index) => ({
          id: Number(frame.id) || index + 1,
          name: typeof frame.name === 'string' && frame.name.trim() ? frame.name.trim() : `Picture ${index + 1}`,
          width: Number(frame.width),
          height: Number(frame.height),
        }));
    }

    state.nextId = Number(parsed.nextId) > 0 ? Number(parsed.nextId) : state.frames.length + 1;

    if (parsed.draftFrame && typeof parsed.draftFrame === 'object') {
      state.draftFrame = {
        name: typeof parsed.draftFrame.name === 'string' && parsed.draftFrame.name.trim() ? parsed.draftFrame.name.trim() : 'Picture',
        width: Number(parsed.draftFrame.width) > 0 ? Number(parsed.draftFrame.width) : 300,
        height: Number(parsed.draftFrame.height) > 0 ? Number(parsed.draftFrame.height) : 400,
        quantity: Math.max(1, Math.min(50, Math.floor(Number(parsed.draftFrame.quantity) || 1))),
      };
    }

    state.selectedLayoutKey = typeof parsed.selectedLayoutKey === 'string' ? parsed.selectedLayoutKey : null;
  } catch (error) {
    console.warn('Could not restore saved state', error);
  }
}

function resizeImageDataUrl(dataUrl, maxDimension = MAX_IMAGE_DIMENSION, quality = IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      let width = image.naturalWidth;
      let height = image.naturalHeight;
      if (!width || !height) {
        reject(new Error('ImageLoadError'));
        return;
      }

      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('ImageLoadError'));
    image.src = dataUrl;
  });
}

function uniqueSizeKey(frame) {
  return `${Number(frame.width).toFixed(3)}x${Number(frame.height).toFixed(3)}`;
}

function estimateUniqueSequenceCount(frames) {
  const counts = new Map();
  frames.forEach((frame) => counts.set(uniqueSizeKey(frame), (counts.get(uniqueSizeKey(frame)) || 0) + 1));
  let result = 1;
  for (let i = 2; i <= frames.length; i += 1) result *= i;
  counts.forEach((count) => {
    for (let i = 2; i <= count; i += 1) result /= i;
  });
  return Math.round(result);
}

function generateUniqueSizeSequences(frames) {
  const groups = new Map();
  frames.forEach((frame) => {
    const key = uniqueSizeKey(frame);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(frame);
  });

  const buckets = Array.from(groups.entries()).map(([key, bucketFrames]) => ({
    key,
    frames: [...bucketFrames].sort((a, b) => a.id - b.id),
    remaining: bucketFrames.length,
    used: 0,
  }));
  buckets.sort((a, b) => b.frames[0].width - a.frames[0].width || b.frames[0].height - a.frames[0].height || a.key.localeCompare(b.key));

  const estimated = estimateUniqueSequenceCount(frames);
  const sequences = [];
  const current = [];
  let truncated = false;

  function walk() {
    if (sequences.length >= MAX_VISUAL_SEQUENCES) {
      truncated = true;
      return;
    }
    if (current.length === frames.length) {
      sequences.push([...current]);
      return;
    }
    for (const bucket of buckets) {
      if (bucket.remaining <= 0) continue;
      bucket.remaining -= 1;
      const frame = bucket.frames[bucket.used];
      bucket.used += 1;
      current.push(frame);
      walk();
      current.pop();
      bucket.used -= 1;
      bucket.remaining += 1;
      if (truncated) return;
    }
  }

  walk();
  return { sequences, estimated, truncated };
}

function generateCompositions(total) {
  const maxRows = total <= 10 ? total : Math.min(8, total);
  const compositions = [];

  function walk(remaining, prefix) {
    if (remaining === 0) {
      compositions.push([...prefix]);
      return;
    }
    if (prefix.length >= maxRows) return;
    for (let count = 1; count <= remaining; count += 1) {
      prefix.push(count);
      walk(remaining - count, prefix);
      prefix.pop();
    }
  }

  walk(total, []);

  return compositions.sort((a, b) => {
    const aRows = a.length;
    const bRows = b.length;
    const aBalance = standardDeviation(a);
    const bBalance = standardDeviation(b);
    return aRows - bRows || aBalance - bBalance || a.join('-').localeCompare(b.join('-'));
  });
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function sliceByCounts(sequence, counts) {
  const groups = [];
  let cursor = 0;
  for (const count of counts) {
    groups.push(sequence.slice(cursor, cursor + count));
    cursor += count;
  }
  return groups;
}

function getPlacementBounds(placements) {
  const entries = Array.from(placements.values());
  if (!entries.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, area: 0 };
  const raw = entries.reduce(
    (bounds, placement) => ({
      left: Math.min(bounds.left, placement.x),
      top: Math.min(bounds.top, placement.y),
      right: Math.max(bounds.right, placement.x + placement.width),
      bottom: Math.max(bounds.bottom, placement.y + placement.height),
    }),
    { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY }
  );
  const width = raw.right - raw.left;
  const height = raw.bottom - raw.top;
  return { ...raw, width, height, area: width * height };
}

function signatureForPlacements(placements) {
  return Array.from(placements.values())
    .map((placement) => ({
      x: Number(placement.x.toFixed(2)),
      y: Number(placement.y.toFixed(2)),
      width: Number(placement.width.toFixed(2)),
      height: Number(placement.height.toFixed(2)),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height)
    .map((placement) => `${placement.x},${placement.y},${placement.width},${placement.height}`)
    .join('|');
}

function getSizePattern(rows) {
  const uniqueWidths = Array.from(new Set(rows.flat().map((frame) => Number(frame.width.toFixed(3))))).sort((a, b) => b - a);
  if (uniqueWidths.length !== 2) return '';
  const [large, small] = uniqueWidths;
  return rows.map((row) => row.map((frame) => (Math.abs(frame.width - large) < 0.001 ? 'W' : Math.abs(frame.width - small) < 0.001 ? 'N' : 'X')).join('')).join('/');
}

function isReferenceAlternatingRows(rows) {
  if (rows.length !== 2 || rows.some((row) => row.length !== 4)) return false;
  const pattern = getSizePattern(rows);
  return pattern === 'WNWN/NWNW' || pattern === 'NWNW/WNWN';
}

function rowPatternName(counts, kind, rows) {
  if (isReferenceAlternatingRows(rows)) return 'Reference-style alternating gallery';
  const key = counts.join('-');
  const names = {
    '4-4': 'Two-row gallery',
    '3-2-3': 'Salon stack',
    '2-4-2': 'Centered band gallery',
    '2-2-2-2': 'Four stacked pairs',
    '1-3-3-1': 'Tapered salon gallery',
    '3-3-3': 'Nine-frame gallery',
  };
  const base = names[key] ?? `${counts.length}-row gallery`;
  if (kind === 'matrix') return `${base} matrix`;
  if (kind === 'columns') return `${counts.length}-column gallery`;
  return base;
}

function placeRowsExactSpacing(rows, wall, spacing, kind = 'rows') {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  if (usableWidth <= 0 || usableHeight <= 0) return null;

  const rowWidths = rows.map((row) => row.reduce((sum, frame) => sum + frame.width, 0) + Math.max(0, row.length - 1) * spacing);
  const rowHeights = rows.map((row) => row.reduce((max, frame) => Math.max(max, frame.height), 0));
  const groupWidth = Math.max(...rowWidths);
  const groupHeight = rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rows.length - 1) * spacing;
  if (groupWidth > usableWidth || groupHeight > usableHeight) return null;

  const startX = wall.innerMargin + (usableWidth - groupWidth) / 2;
  const startY = wall.innerMargin + (usableHeight - groupHeight) / 2;
  const placements = new Map();
  let y = startY;

  rows.forEach((row, rowIndex) => {
    const rowWidth = rowWidths[rowIndex];
    const rowHeight = rowHeights[rowIndex];
    let x = startX + (groupWidth - rowWidth) / 2;
    row.forEach((frame, columnIndex) => {
      placements.set(frame.id, {
        x,
        y: y + (rowHeight - frame.height) / 2,
        width: frame.width,
        height: frame.height,
        rowIndex,
        columnIndex,
      });
      x += frame.width + spacing;
    });
    y += rowHeight + spacing;
  });

  const bounds = getPlacementBounds(placements);
  return {
    ok: true,
    kind,
    placements,
    rows: rows.map((row, index) => ({ items: row, rowWidth: rowWidths[index], rowHeight: rowHeights[index], horizontalGap: spacing })),
    rowCount: rows.length,
    rowPattern: rows.map((row) => row.length).join('-'),
    minGap: spacing,
    spacing,
    usableWidth,
    usableHeight,
    groupWidth,
    groupHeight,
    groupArea: bounds.area,
    bounds,
  };
}

function placeMatrixExactSpacing(rows, wall, spacing) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  if (!rows.length || rows.some((row) => row.length !== rows[0].length)) return null;

  const rowCount = rows.length;
  const columnCount = rows[0].length;
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) =>
    rows.reduce((max, row) => Math.max(max, row[columnIndex].width), 0)
  );
  const rowHeights = rows.map((row) => row.reduce((max, frame) => Math.max(max, frame.height), 0));
  const groupWidth = columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columnCount - 1) * spacing;
  const groupHeight = rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowCount - 1) * spacing;
  if (groupWidth > usableWidth || groupHeight > usableHeight) return null;

  const startX = wall.innerMargin + (usableWidth - groupWidth) / 2;
  const startY = wall.innerMargin + (usableHeight - groupHeight) / 2;
  const placements = new Map();
  let y = startY;

  rows.forEach((row, rowIndex) => {
    let x = startX;
    row.forEach((frame, columnIndex) => {
      placements.set(frame.id, {
        x: x + (columnWidths[columnIndex] - frame.width) / 2,
        y: y + (rowHeights[rowIndex] - frame.height) / 2,
        width: frame.width,
        height: frame.height,
        rowIndex,
        columnIndex,
      });
      x += columnWidths[columnIndex] + spacing;
    });
    y += rowHeights[rowIndex] + spacing;
  });

  const bounds = getPlacementBounds(placements);
  return {
    ok: true,
    kind: 'matrix',
    placements,
    rows: rows.map((row, index) => ({ items: row, rowWidth: groupWidth, rowHeight: rowHeights[index], horizontalGap: spacing })),
    rowCount,
    columnCount,
    rowPattern: rows.map((row) => row.length).join('-'),
    minGap: spacing,
    spacing,
    usableWidth,
    usableHeight,
    groupWidth,
    groupHeight,
    groupArea: bounds.area,
    bounds,
  };
}

function placeColumnsExactSpacing(columns, wall, spacing) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  if (!columns.length) return null;

  const columnWidths = columns.map((column) => column.reduce((max, frame) => Math.max(max, frame.width), 0));
  const columnHeights = columns.map((column) => column.reduce((sum, frame) => sum + frame.height, 0) + Math.max(0, column.length - 1) * spacing);
  const groupWidth = columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns.length - 1) * spacing;
  const groupHeight = Math.max(...columnHeights);
  if (groupWidth > usableWidth || groupHeight > usableHeight) return null;

  const startX = wall.innerMargin + (usableWidth - groupWidth) / 2;
  const startY = wall.innerMargin + (usableHeight - groupHeight) / 2;
  const placements = new Map();
  let x = startX;

  columns.forEach((column, columnIndex) => {
    let y = startY + (groupHeight - columnHeights[columnIndex]) / 2;
    column.forEach((frame, rowIndex) => {
      placements.set(frame.id, {
        x: x + (columnWidths[columnIndex] - frame.width) / 2,
        y,
        width: frame.width,
        height: frame.height,
        rowIndex,
        columnIndex,
      });
      y += frame.height + spacing;
    });
    x += columnWidths[columnIndex] + spacing;
  });

  const bounds = getPlacementBounds(placements);
  return {
    ok: true,
    kind: 'columns',
    placements,
    rows: columns.map((column, index) => ({ items: column, rowWidth: columnWidths[index], rowHeight: columnHeights[index], horizontalGap: spacing })),
    rowCount: columns.length,
    rowPattern: columns.map((column) => column.length).join('-'),
    minGap: spacing,
    spacing,
    usableWidth,
    usableHeight,
    groupWidth,
    groupHeight,
    groupArea: bounds.area,
    bounds,
  };
}

function scoreCandidate(candidate, wall) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  const usableAspect = usableWidth / usableHeight;
  const groupAspect = candidate.groupWidth / candidate.groupHeight;
  const rowWidths = candidate.rows.map((row) => row.rowWidth);
  const rowCounts = candidate.rows.map((row) => row.items.length);
  const widthBalance = standardDeviation(rowWidths) / Math.max(1, usableWidth);
  const countBalance = standardDeviation(rowCounts) / Math.max(1, candidate.rows.length);
  const aspectPenalty = Math.abs(Math.log(Math.max(0.01, groupAspect) / Math.max(0.01, usableAspect)));
  const compactRatio = candidate.groupArea / Math.max(1, usableWidth * usableHeight);
  const fillWidth = candidate.groupWidth / Math.max(1, usableWidth);
  const fillHeight = candidate.groupHeight / Math.max(1, usableHeight);
  const preferredWidthPenalty = Math.abs(fillWidth - 0.68);
  const preferredHeightPenalty = Math.abs(fillHeight - 0.42);
  const rowsBonus = candidate.rowPattern === '4-4' ? 220 : candidate.rowPattern === '3-2-3' || candidate.rowPattern === '2-4-2' ? 130 : 0;
  const matrixPenalty = candidate.kind === 'matrix' ? 65 : 0;
  const columnsPenalty = candidate.kind === 'columns' ? 80 : 0;
  const referenceBonus = candidate.referenceStyle ? 1300 : 0;

  return (
    referenceBonus +
    rowsBonus -
    widthBalance * 2200 -
    countBalance * 700 -
    aspectPenalty * 180 -
    compactRatio * 160 -
    preferredWidthPenalty * 130 -
    preferredHeightPenalty * 90 -
    matrixPenalty -
    columnsPenalty
  );
}

function finalizeCandidate(raw, wall, counts, indexInSearch) {
  const rows = raw.rows.map((row) => row.items);
  const referenceStyle = raw.kind === 'rows' && isReferenceAlternatingRows(rows);
  const signature = signatureForPlacements(raw.placements);
  const name = rowPatternName(counts, raw.kind, rows);
  const metrics = {
    score: scoreCandidate({ ...raw, referenceStyle }, wall),
    groupArea: raw.groupArea,
    groupWidth: raw.groupWidth,
    groupHeight: raw.groupHeight,
    compact: state.layoutSettings.compact,
  };

  return {
    ...raw,
    referenceStyle,
    signature,
    key: `${raw.kind}:${raw.rowPattern}:${signature}`,
    name,
    metrics,
    searchOrder: indexInSearch,
  };
}

function selectCandidates(candidates, compactRequired) {
  if (!candidates.length) return [];
  let pool = candidates;

  if (compactRequired) {
    const minArea = Math.min(...pool.map((candidate) => candidate.groupArea));
    const tolerance = Math.max(1, minArea * 0.002);
    pool = pool.filter((candidate) => candidate.groupArea <= minArea + tolerance);
  }

  return pool
    .sort((a, b) => b.metrics.score - a.metrics.score || a.groupArea - b.groupArea || a.searchOrder - b.searchOrder)
    .slice(0, MAX_CANDIDATES_TO_SHOW);
}

function computeLayoutCandidates(frames, wall, settings = state.layoutSettings) {
  const spacing = Math.max(0, Number(settings.spacing) || 0);
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  const emptyStats = { visualPermutations: 0, estimatedPermutations: 0, rowPatterns: 0, checked: 0, unique: 0, truncated: false };

  if (usableWidth <= 0 || usableHeight <= 0) {
    state.searchStats = emptyStats;
    return [{ key: 'invalid-margin', name: 'Invalid wall setup', placements: new Map(), rows: [], minGap: 0, rowCount: 0, usableWidth, usableHeight, invalidReason: 'The inner margin is too large for the selected wall dimensions.' }];
  }

  for (const frame of frames) {
    if (frame.width > usableWidth || frame.height > usableHeight) {
      state.searchStats = emptyStats;
      return [{ key: 'frame-too-large', name: 'Frame too large', placements: new Map(), rows: [], minGap: 0, rowCount: 0, usableWidth, usableHeight, invalidReason: `“${frame.name}” is too large to fit inside the usable wall area.` }];
    }
  }

  if (!frames.length) {
    state.searchStats = emptyStats;
    return [{ key: 'empty-wall', name: 'Empty wall', placements: new Map(), rows: [], minGap: spacing, rowCount: 0, usableWidth, usableHeight, groupArea: 0, metrics: { score: 0, groupArea: 0 } }];
  }

  const { sequences, estimated, truncated } = generateUniqueSizeSequences(frames);
  const compositions = generateCompositions(frames.length);
  const candidates = [];
  const seen = new Set();
  let checked = 0;

  sequences.forEach((sequence) => {
    compositions.forEach((counts) => {
      const rows = sliceByCounts(sequence, counts);
      const rawRow = placeRowsExactSpacing(rows, wall, spacing, 'rows');
      checked += 1;
      if (rawRow) {
        const candidate = finalizeCandidate(rawRow, wall, counts, checked);
        if (!seen.has(candidate.signature)) {
          seen.add(candidate.signature);
          candidates.push(candidate);
        }
      }

      if (rows.length > 1 && rows.every((row) => row.length === rows[0].length)) {
        const rawMatrix = placeMatrixExactSpacing(rows, wall, spacing);
        checked += 1;
        if (rawMatrix) {
          const candidate = finalizeCandidate(rawMatrix, wall, counts, checked);
          if (!seen.has(candidate.signature)) {
            seen.add(candidate.signature);
            candidates.push(candidate);
          }
        }
      }

      if (counts.length > 1) {
        const columns = sliceByCounts(sequence, counts);
        const rawColumn = placeColumnsExactSpacing(columns, wall, spacing);
        checked += 1;
        if (rawColumn) {
          const candidate = finalizeCandidate(rawColumn, wall, counts, checked);
          if (!seen.has(candidate.signature)) {
            seen.add(candidate.signature);
            candidates.push(candidate);
          }
        }
      }
    });
  });

  state.searchStats = {
    visualPermutations: sequences.length,
    estimatedPermutations: estimated,
    rowPatterns: compositions.length,
    checked,
    unique: candidates.length,
    truncated,
  };

  const selected = selectCandidates(candidates, Boolean(settings.compact));
  if (!selected.length) {
    return [{ key: 'no-layout', name: 'No valid layout', placements: new Map(), rows: [], minGap: 0, rowCount: 0, usableWidth, usableHeight, invalidReason: 'No valid layout remains with the current spacing, margin, wall size, and frames.' }];
  }

  return selected;
}

function recalculateLayouts(preserveSelection = true) {
  const previousKey = preserveSelection ? getActiveLayout()?.key ?? state.selectedLayoutKey : null;
  state.layoutCandidates = computeLayoutCandidates(state.frames, state.wall, state.layoutSettings);
  state.selectedLayoutKey = previousKey;
  updateSelectedLayoutByKey();
}

function applyWallSettings(nextWall, nextLayoutSettings = state.layoutSettings) {
  state.wall = { ...state.wall, ...nextWall, unit: 'mm' };
  state.layoutSettings = {
    spacing: Math.max(0, Number(nextLayoutSettings.spacing) || 0),
    compact: Boolean(nextLayoutSettings.compact),
  };
  recalculateLayouts(true);
  render();
  persistState();

  const activeLayout = getActiveLayout();
  if (activeLayout?.invalidReason) {
    showMessage(activeLayout.invalidReason, 'error');
    return false;
  }

  showMessage('Wall and layout settings applied. Layouts were regenerated from the current frames.', 'info');
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
  const nextLayoutSettings = getCurrentLayoutSettings();

  if ([nextWall.width, nextWall.height, nextWall.innerMargin, nextLayoutSettings.spacing].some((value) => Number.isNaN(value))) {
    showMessage('Enter valid numeric wall and spacing values.', 'error');
    return;
  }

  if (nextWall.width <= 0 || nextWall.height <= 0 || nextWall.innerMargin < 0 || nextLayoutSettings.spacing < 0) {
    showMessage('Wall width and height must be positive. Inner margin and photo spacing cannot be negative.', 'error');
    return;
  }

  applyWallSettings(nextWall, nextLayoutSettings);
}

function showCropPanel() {
  openModal(els.cropModal);
}

function hideCropPanel() {
  closeModal(els.cropModal);
  state.cropInteraction = null;
}

function updateEditWallAreaButton() {
  const hasPhoto = Boolean(state.wall.sourceImage || state.pendingCrop?.dataUrl);
  els.editWallArea.classList.toggle('hidden', !hasPhoto);
}

function updatePhotoPreview() {
  const previewImage = state.wall.backgroundImage || state.wall.sourceImage;
  const hasPhoto = Boolean(previewImage);
  els.photoPreviewCard.classList.toggle('hidden', !hasPhoto);
  if (!hasPhoto) return;
  els.photoPreviewImage.src = previewImage;
  els.photoPreviewTitle.textContent = state.wall.backgroundImage ? 'Wall photo ready' : 'Wall photo selected';
  els.photoPreviewMeta.textContent = state.wall.backgroundImage ? 'The marked wall area is applied to the preview below.' : 'A photo is loaded. Adjust the wall area before placing frames.';
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
  const image = new Image();
  image.onload = () => {
    const suggested = selection ? cloneSelection(selection) : getSuggestedCropSelection(image.naturalWidth, image.naturalHeight);
    state.pendingCrop = { dataUrl, sourceLabel, selection: suggested };
    els.cropImage.src = dataUrl;
    showCropPanel();
    renderCropSelection();
    updateEditWallAreaButton();
    showMessage(`Adjust the wall-area overlay for the ${sourceLabel}, then apply the selected wall area.`, 'info');
  };
  image.onerror = () => showMessage('Could not load that photo. Try another image.', 'error');
  image.src = dataUrl;
}

function closeCropEditor() {
  hideCropPanel();
  state.pendingCrop = null;
  updateEditWallAreaButton();
}

function loadWallImageFile(file, sourceLabel = 'photo') {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const resized = await resizeImageDataUrl(String(reader.result));
      openCropEditor(resized, sourceLabel);
    } catch (error) {
      openCropEditor(String(reader.result), sourceLabel);
    }
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
  updatePhotoPreview();
  persistState();
  showMessage('Wall photo removed.', 'info');
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage('Live camera is not supported in this browser. Use the main photo buttons instead.', 'error');
    return;
  }

  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    state.cameraStream = stream;
    els.cameraVideo.srcObject = stream;
    openModal(els.cameraModal);
    await els.cameraVideo.play();
    showMessage('Live preview camera opened.', 'info');
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
    showMessage('Could not open the live camera in this browser. Use the main photo buttons instead.', 'error');
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  if (els.cameraVideo) {
    els.cameraVideo.pause();
    els.cameraVideo.srcObject = null;
  }
  closeModal(els.cameraModal);
}

async function capturePhoto() {
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
  const dataUrl = els.cameraCanvas.toDataURL('image/jpeg', IMAGE_QUALITY);
  stopCamera();
  try {
    const resized = await resizeImageDataUrl(dataUrl);
    openCropEditor(resized, 'camera photo');
  } catch (error) {
    openCropEditor(dataUrl, 'camera photo');
  }
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
  const croppedDataUrl = els.cameraCanvas.toDataURL('image/jpeg', IMAGE_QUALITY);

  state.wall.sourceImage = state.pendingCrop.dataUrl;
  state.wall.cropSelection = cloneSelection(selection);
  state.wall.backgroundImage = croppedDataUrl;
  els.wallImageCamera.value = '';
  els.wallImageGallery.value = '';
  hideCropPanel();
  state.pendingCrop = null;
  updateEditWallAreaButton();
  render();
  persistState();
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
  if (!state.cropInteraction || !state.pendingCrop || event.pointerId !== state.cropInteraction.pointerId) return;
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

    if (handle.includes('w')) newLeft = clamp(left + dx, 0, right - MIN_CROP_SIZE);
    if (handle.includes('e')) newRight = clamp(right + dx, left + MIN_CROP_SIZE, 1);
    if (handle.includes('n')) newTop = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
    if (handle.includes('s')) newBottom = clamp(bottom + dy, top + MIN_CROP_SIZE, 1);

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
    if (event?.pointerId !== undefined) els.cropStage.releasePointerCapture?.(event.pointerId);
  } catch (error) {
    // Ignore release errors from browsers that already released the pointer.
  }
  state.cropInteraction = null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNextNameIndex(baseName) {
  const suffixPattern = new RegExp(`^${escapeRegExp(baseName)}\\s+(\\d+)$`);
  let highest = 0;
  state.frames.forEach((frame) => {
    const match = frame.name.match(suffixPattern);
    if (!match) return;
    highest = Math.max(highest, Number(match[1]) || 0);
  });
  return highest + 1;
}

function addFrame(event) {
  event.preventDefault();

  const width = Number(els.frameWidth.value);
  const height = Number(els.frameHeight.value);
  const quantity = Math.max(1, Math.min(50, Math.floor(Number(els.frameQuantity.value) || 1)));
  const baseName = els.frameName.value.trim() || 'Picture';

  if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
    showMessage('Enter valid positive frame dimensions.', 'error');
    return;
  }

  state.layoutSettings = getCurrentLayoutSettings();
  const usableWidth = state.wall.width - state.wall.innerMargin * 2;
  const usableHeight = state.wall.height - state.wall.innerMargin * 2;
  if (width > usableWidth || height > usableHeight) {
    showMessage(`Cannot add that picture frame. “${baseName}” is too large for the usable wall area.`, 'error');
    return;
  }

  const startingNameIndex = getNextNameIndex(baseName);
  const newFrames = Array.from({ length: quantity }, (_, index) => ({
    id: state.nextId + index,
    name: `${baseName} ${startingNameIndex + index}`,
    width,
    height,
  }));

  const nextFrames = [...state.frames, ...newFrames];
  const nextLayouts = computeLayoutCandidates(nextFrames, state.wall, state.layoutSettings);
  const firstLayout = nextLayouts[0];
  if (!nextLayouts.length || firstLayout?.invalidReason) {
    showMessage(`Cannot add ${quantity} frame${quantity === 1 ? '' : 's'} at that size. ${firstLayout?.invalidReason ?? 'No valid layout remains.'}`, 'error');
    return;
  }

  state.frames = nextFrames;
  state.nextId += quantity;
  state.layoutCandidates = nextLayouts;
  state.selectedLayoutIndex = 0;
  state.selectedLayoutKey = getActiveLayout()?.key ?? null;
  state.draftFrame = { name: baseName, width, height, quantity: 1 };

  els.frameName.value = baseName;
  els.frameWidth.value = formatNumber(width);
  els.frameHeight.value = formatNumber(height);
  els.frameQuantity.value = '1';

  render();
  persistState();
  const rangeCopy = quantity > 1 ? ` through ${newFrames.at(-1).name}` : '';
  showMessage(`Added ${quantity} “${baseName}” frame${quantity === 1 ? '' : 's'} as ${newFrames[0].name}${rangeCopy}. ${state.layoutCandidates.length} visual layouts are ready.`, 'info');
}

function removeFrame(frameId) {
  state.frames = state.frames.filter((frame) => frame.id !== frameId);
  recalculateLayouts(true);
  render();
  persistState();
  showMessage('Picture frame removed and layouts updated.', 'info');
}

function clearFrames() {
  state.frames = [];
  recalculateLayouts(false);
  render();
  persistState();
  showMessage('All frames removed.', 'info');
}

function cycleLayout(direction) {
  if (state.layoutCandidates.length <= 1) return;
  state.selectedLayoutIndex = (state.selectedLayoutIndex + direction + state.layoutCandidates.length) % state.layoutCandidates.length;
  state.selectedLayoutKey = getActiveLayout()?.key ?? null;
  render();
  persistState();
  showMessage(`Showing layout ${state.selectedLayoutIndex + 1} of ${state.layoutCandidates.length}.`, 'info');
}

function renderSummary() {
  const usableWidth = state.wall.width - state.wall.innerMargin * 2;
  const usableHeight = state.wall.height - state.wall.innerMargin * 2;
  const usableArea = Math.max(usableWidth, 0) * Math.max(usableHeight, 0);
  const usedArea = state.frames.reduce((sum, frame) => sum + getFrameArea(frame), 0);
  const fillPct = usableArea > 0 ? Math.min((usedArea / usableArea) * 100, 100).toFixed(1) : '0.0';
  const activeLayout = getActiveLayout();
  const layoutLine = activeLayout?.invalidReason ? activeLayout.invalidReason : activeLayout ? `${activeLayout.name}, ${state.selectedLayoutIndex + 1}/${state.layoutCandidates.length}` : 'No layout';
  const photoLine = state.wall.backgroundImage ? 'Wall photo aligned and saved locally' : state.wall.sourceImage ? 'Photo selected, wall area not applied yet' : 'No wall photo';

  els.wallSummary.innerHTML = `
    <div><strong>Wall:</strong> ${areaLabel(state.wall.width, state.wall.height, state.wall.unit)}</div>
    <div><strong>Inner margin:</strong> ${formatNumber(state.wall.innerMargin)} ${state.wall.unit}</div>
    <div><strong>Frame spacing:</strong> ${formatNumber(state.layoutSettings.spacing)} ${state.wall.unit}</div>
    <div><strong>Compact only:</strong> ${state.layoutSettings.compact ? 'Yes' : 'No'}</div>
    <div><strong>Usable area:</strong> ${areaLabel(usableWidth, usableHeight, state.wall.unit)}</div>
    <div><strong>Frames:</strong> ${state.frames.length}</div>
    <div><strong>Filled area:</strong> ${fillPct}%</div>
    <div><strong>Active layout:</strong> ${escapeHtml(layoutLine)}</div>
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

function renderLayoutToolbar() {
  const activeLayout = getActiveLayout();
  if (!activeLayout) {
    els.layoutName.textContent = 'No layout';
    els.layoutMeta.textContent = '0 layouts';
  } else if (activeLayout.invalidReason) {
    els.layoutName.textContent = activeLayout.name;
    els.layoutMeta.textContent = activeLayout.invalidReason;
  } else {
    els.layoutName.textContent = activeLayout.name;
    const compactLabel = state.layoutSettings.compact ? ' • compact-only' : '';
    const referenceLabel = activeLayout.referenceStyle ? ' • matches alternating reference style' : '';
    els.layoutMeta.textContent = `${state.selectedLayoutIndex + 1} of ${state.layoutCandidates.length} layouts • pattern ${activeLayout.rowPattern} • ${formatNumber(activeLayout.groupWidth)} × ${formatNumber(activeLayout.groupHeight)} mm${compactLabel}${referenceLabel}`;
  }

  const stats = state.searchStats;
  if (els.layoutProgress && stats) {
    const truncatedCopy = stats.truncated ? `; stopped after ${stats.visualPermutations} visual permutations` : '';
    els.layoutProgress.textContent = `Search checked ${stats.checked.toLocaleString()} arrangements from ${stats.visualPermutations.toLocaleString()} visual size-order permutations and kept ${stats.unique.toLocaleString()} unique geometries${truncatedCopy}.`;
  }

  const disableSwitching = state.layoutCandidates.length <= 1;
  els.prevLayout.disabled = disableSwitching;
  els.nextLayout.disabled = disableSwitching;
}

function fitWallToViewport() {
  const maxWidth = Math.max(els.wallViewport.clientWidth - 8, 240);
  const isDesktop = window.innerWidth >= 960;
  const maxHeight = Math.max(window.innerHeight * (isDesktop ? 0.58 : 0.34), isDesktop ? 320 : 220);
  const scale = Math.min(maxWidth / state.wall.width, maxHeight / state.wall.height);
  return { scale, width: state.wall.width * scale, height: state.wall.height * scale };
}

function renderWall() {
  const { width, height } = fitWallToViewport();
  els.wallCanvas.style.width = `${width}px`;
  els.wallCanvas.style.height = `${height}px`;

  if (state.wall.backgroundImage) {
    els.wallCanvas.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url(${state.wall.backgroundImage})`;
  } else {
    els.wallCanvas.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.28)), linear-gradient(180deg, #d8d1c9, #c4b8ab)';
  }

  const canvasWidth = els.wallCanvas.clientWidth || width;
  const canvasHeight = els.wallCanvas.clientHeight || height;
  const scaleX = canvasWidth / state.wall.width;
  const scaleY = canvasHeight / state.wall.height;

  const innerLeft = state.wall.innerMargin * scaleX;
  const innerTop = state.wall.innerMargin * scaleY;
  const innerWidth = (state.wall.width - state.wall.innerMargin * 2) * scaleX;
  const innerHeight = (state.wall.height - state.wall.innerMargin * 2) * scaleY;

  els.usableArea.style.left = `${innerLeft}px`;
  els.usableArea.style.top = `${innerTop}px`;
  els.usableArea.style.width = `${Math.max(innerWidth, 0)}px`;
  els.usableArea.style.height = `${Math.max(innerHeight, 0)}px`;

  els.frameLayer.innerHTML = '';
  const activeLayout = getActiveLayout();
  if (!activeLayout || activeLayout.invalidReason) return;

  state.frames.forEach((frame) => {
    const placement = activeLayout.placements.get(frame.id);
    if (!placement) return;
    const frameEl = document.createElement('div');
    frameEl.className = 'wall-frame';
    if (placement.width * scaleX < 54 || placement.height * scaleY < 42) frameEl.classList.add('frame-compact');
    frameEl.style.left = `${placement.x * scaleX}px`;
    frameEl.style.top = `${placement.y * scaleY}px`;
    frameEl.style.width = `${placement.width * scaleX}px`;
    frameEl.style.height = `${placement.height * scaleY}px`;
    const label = document.createElement('span');
    label.textContent = frame.name;
    frameEl.appendChild(label);
    els.frameLayer.appendChild(frameEl);
  });
}

function render() {
  updateEditWallAreaButton();
  updatePhotoPreview();
  renderSummary();
  renderFrameList();
  renderLayoutToolbar();
  renderWall();
  if (state.pendingCrop) renderCropSelection();
  showMessage(state.lastMessage.text, state.lastMessage.type);
}

function handleModalScrimClick(event) {
  const closeType = event.target instanceof HTMLElement ? event.target.dataset.closeModal : null;
  if (closeType === 'camera') stopCamera();
  if (closeType === 'crop') closeCropEditor();
}

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  if (!els.cropModal.classList.contains('hidden')) {
    closeCropEditor();
    return;
  }
  if (!els.cameraModal.classList.contains('hidden')) stopCamera();
}

function updateCropStageRatio() {
  if (!els.cropImage.naturalWidth || !els.cropImage.naturalHeight) return;
  els.cropStage.style.setProperty('--crop-ratio', `${els.cropImage.naturalWidth} / ${els.cropImage.naturalHeight}`);
  renderCropSelection();
}

function hydrateInputsFromState() {
  els.wallWidth.value = formatNumber(state.wall.width);
  els.wallHeight.value = formatNumber(state.wall.height);
  els.innerMargin.value = formatNumber(state.wall.innerMargin);
  if (els.frameSpacing) els.frameSpacing.value = formatNumber(state.layoutSettings.spacing);
  if (els.compactLayout) els.compactLayout.checked = Boolean(state.layoutSettings.compact);
  els.frameName.value = state.draftFrame.name || 'Picture';
  els.frameWidth.value = formatNumber(state.draftFrame.width || 300);
  els.frameHeight.value = formatNumber(state.draftFrame.height || 400);
  els.frameQuantity.value = String(state.draftFrame.quantity || 1);
}

function init() {
  restoreState();
  hydrateInputsFromState();
  recalculateLayouts(false);
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
  els.cropSelection.querySelectorAll('[data-handle]').forEach((handle) => handle.addEventListener('pointerdown', beginCropInteraction));
  els.cropStage.addEventListener('pointermove', updateCropInteraction);
  els.cropStage.addEventListener('pointerup', endCropInteraction);
  els.cropStage.addEventListener('pointercancel', endCropInteraction);
  els.frameForm.addEventListener('submit', addFrame);
  els.clearFrames.addEventListener('click', clearFrames);
  els.prevLayout.addEventListener('click', () => cycleLayout(-1));
  els.nextLayout.addEventListener('click', () => cycleLayout(1));
  [els.frameName, els.frameWidth, els.frameHeight, els.frameQuantity].forEach((input) => input.addEventListener('change', persistDraftFrame));
  [els.frameSpacing, els.compactLayout].filter(Boolean).forEach((input) => {
    input.addEventListener('change', () => {
      applyWallSettings(
        {
          width: Number(els.wallWidth.value),
          height: Number(els.wallHeight.value),
          innerMargin: Number(els.innerMargin.value),
          unit: 'mm',
        },
        getCurrentLayoutSettings()
      );
    });
  });
  els.cropImage.addEventListener('load', updateCropStageRatio);
  els.cameraModal.addEventListener('click', handleModalScrimClick);
  els.cropModal.addEventListener('click', handleModalScrimClick);
  document.addEventListener('keydown', handleEscape);

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
