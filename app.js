const MIN_CROP_SIZE = 0.12;
const STORAGE_KEY = 'wall-picture-planner-v4';
const DEFAULT_FRAME_THICKNESS = 20;
const FRAME_SPACING_MULTIPLIER = 3;
const MIN_RECOMMENDED_SPACING = 50;
const MAX_RECOMMENDED_SPACING = 75;
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
    spacing: DEFAULT_FRAME_THICKNESS * FRAME_SPACING_MULTIPLIER,
    frameThickness: DEFAULT_FRAME_THICKNESS,
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
  pendingFrameImageId: null,
  frameActionFrameId: null,
  spacingWasManuallyEdited: false,
  cropInteraction: null,
  lastMessage: {
    type: 'info',
    text: 'Ready. Enter the wall size, frame thickness, and spacing, then take a photo or choose one from your gallery.',
  },
};

const els = {
  wallForm: document.getElementById('wall-form'),
  frameForm: document.getElementById('frame-form'),
  wallWidth: document.getElementById('wall-width'),
  wallHeight: document.getElementById('wall-height'),
  innerMargin: document.getElementById('inner-margin'),
  frameSpacing: document.getElementById('frame-spacing'),
  frameThickness: document.getElementById('frame-thickness'),
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
  frameImageInput: document.getElementById('frame-image-input'),
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
  placementInstructions: document.getElementById('placement-instructions'),
  frameStrip: document.getElementById('frame-strip'),
  frameActionModal: document.getElementById('frame-action-modal'),
  frameActionNumber: document.getElementById('frame-action-number'),
  frameActionTitle: document.getElementById('frame-action-title'),
  frameActionMeta: document.getElementById('frame-action-meta'),
  frameActionPhoto: document.getElementById('frame-action-photo'),
  frameActionRemovePhoto: document.getElementById('frame-action-remove-photo'),
  frameActionRemove: document.getElementById('frame-action-remove'),
  frameActionCancel: document.getElementById('frame-action-cancel'),
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
  const hasOpenModal =
    !els.cameraModal.classList.contains('hidden') ||
    !els.cropModal.classList.contains('hidden') ||
    (els.frameActionModal && !els.frameActionModal.classList.contains('hidden'));
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

function getRecommendedSpacing(frameThickness) {
  const raw = Math.max(0, Number(frameThickness) || 0) * FRAME_SPACING_MULTIPLIER;
  if (raw <= 0) return MIN_RECOMMENDED_SPACING;
  return clamp(raw, MIN_RECOMMENDED_SPACING, MAX_RECOMMENDED_SPACING);
}

function getCurrentLayoutSettings() {
  const frameThickness = Math.max(0, Number(els.frameThickness?.value) || 0);
  return {
    spacing: Math.max(0, Number(els.frameSpacing?.value) || 0),
    frameThickness,
    compact: Boolean(els.compactLayout?.checked),
  };
}

function persistState() {
  try {
    const activeLayout = getActiveLayout();
    const payload = {
      version: 7,
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
      const restoredThickness = Number(parsed.layoutSettings.frameThickness);
      const hasStoredThickness = Number.isFinite(restoredThickness);
      const frameThickness = hasStoredThickness ? Math.max(0, restoredThickness) : DEFAULT_FRAME_THICKNESS;
      const restoredSpacing = Number(parsed.layoutSettings.spacing);
      let spacing = Number.isFinite(restoredSpacing) ? Math.max(0, restoredSpacing) : getRecommendedSpacing(frameThickness);
      if (!hasStoredThickness && spacing === 10) spacing = getRecommendedSpacing(frameThickness);
      state.layoutSettings = {
        spacing,
        frameThickness,
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
          photoDataUrl: typeof frame.photoDataUrl === 'string' ? frame.photoDataUrl : null,
          photoName: typeof frame.photoName === 'string' ? frame.photoName : '',
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

function getSizePatternFromRows(rows) {
  const uniqueWidths = Array.from(new Set(rows.flat().map((frame) => Number(frame.width.toFixed(3))))).sort((a, b) => b - a);
  if (uniqueWidths.length !== 2) return '';
  const [large, small] = uniqueWidths;
  return rows
    .map((row) => row.map((frame) => (Math.abs(frame.width - large) < 0.001 ? 'W' : Math.abs(frame.width - small) < 0.001 ? 'N' : 'X')).join(''))
    .join('/');
}

function isReferenceAlternatingRows(rows) {
  if (rows.length !== 2 || rows.some((row) => row.length !== 4)) return false;
  const pattern = getSizePatternFromRows(rows);
  return pattern === 'WNWN/NWNW' || pattern === 'NWNW/WNWN';
}

function layoutNameFor(raw, rows) {
  if (raw.referenceStyle || isReferenceAlternatingRows(rows)) return 'Reference-style alternating 4-column gallery';
  if (raw.kind === 'grid') {
    const emptyCount = raw.gridRows * raw.gridColumns - raw.frameCount;
    if (emptyCount > 0) return `${raw.gridRows}×${raw.gridColumns} staggered gallery grid`;
    return `${raw.gridRows}×${raw.gridColumns} gallery grid`;
  }
  const counts = rows.map((row) => row.length);
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
  if (raw.kind === 'matrix') return `${base} with aligned columns`;
  if (raw.kind === 'columns') return `${counts.length}-column vertical gallery`;
  return base;
}

function placeRowsExactSpacing(rows, wall, spacing, kind = 'rows') {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  if (usableWidth <= 0 || usableHeight <= 0 || !rows.length) return null;

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
    frameCount: rows.flat().length,
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
    frameCount: rows.flat().length,
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
    frameCount: columns.flat().length,
  };
}

function maskHasNoEmptyRowsOrColumns(mask, rows, columns) {
  const rowCounts = Array(rows).fill(0);
  const columnCounts = Array(columns).fill(0);
  mask.forEach((occupied, index) => {
    if (!occupied) return;
    const row = Math.floor(index / columns);
    const column = index % columns;
    rowCounts[row] += 1;
    columnCounts[column] += 1;
  });
  return rowCounts.every(Boolean) && columnCounts.every(Boolean);
}

function generateGridMasks(rows, columns, occupiedCount) {
  const cellCount = rows * columns;
  const masks = [];
  if (occupiedCount > cellCount) return masks;

  function walk(index, remaining, mask) {
    if (remaining === 0) {
      const finished = mask.concat(Array(cellCount - index).fill(false));
      if (maskHasNoEmptyRowsOrColumns(finished, rows, columns)) masks.push(finished);
      return;
    }
    if (index >= cellCount) return;
    if (cellCount - index < remaining) return;

    mask.push(true);
    walk(index + 1, remaining - 1, mask);
    mask.pop();

    mask.push(false);
    walk(index + 1, remaining, mask);
    mask.pop();
  }

  walk(0, occupiedCount, []);
  return masks;
}

function generateGridSpecs(frameCount) {
  const specs = [];
  const maxRows = Math.min(5, frameCount);
  const maxColumns = Math.min(5, frameCount);
  for (let rows = 1; rows <= maxRows; rows += 1) {
    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const cells = rows * columns;
      if (cells < frameCount) continue;
      if (cells > frameCount + 4) continue;
      if (rows === 1 || columns === 1) continue;
      specs.push({ rows, columns, cells, empty: cells - frameCount });
    }
  }
  return specs.sort((a, b) => a.empty - b.empty || Math.abs(a.rows - a.columns) - Math.abs(b.rows - b.columns) || a.rows - b.rows || a.columns - b.columns);
}

function placeGridExactSpacing(sequence, mask, gridRows, gridColumns, wall, spacing) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  if (usableWidth <= 0 || usableHeight <= 0) return null;

  const cells = Array.from({ length: gridRows }, () => Array(gridColumns).fill(null));
  let cursor = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const frame = sequence[cursor];
    if (!frame) return null;
    const row = Math.floor(index / gridColumns);
    const column = index % gridColumns;
    cells[row][column] = frame;
    cursor += 1;
  }
  if (cursor !== sequence.length) return null;

  const columnWidths = Array.from({ length: gridColumns }, (_, column) =>
    cells.reduce((max, row) => Math.max(max, row[column]?.width ?? 0), 0)
  );
  const rowHeights = cells.map((row) => row.reduce((max, frame) => Math.max(max, frame?.height ?? 0), 0));
  if (columnWidths.some((value) => value <= 0) || rowHeights.some((value) => value <= 0)) return null;

  const groupWidth = columnWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, gridColumns - 1) * spacing;
  const groupHeight = rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, gridRows - 1) * spacing;
  if (groupWidth > usableWidth || groupHeight > usableHeight) return null;

  const startX = wall.innerMargin + (usableWidth - groupWidth) / 2;
  const startY = wall.innerMargin + (usableHeight - groupHeight) / 2;
  const placements = new Map();
  const displayRows = [];
  let y = startY;

  for (let rowIndex = 0; rowIndex < gridRows; rowIndex += 1) {
    let x = startX;
    const items = [];
    for (let columnIndex = 0; columnIndex < gridColumns; columnIndex += 1) {
      const frame = cells[rowIndex][columnIndex];
      if (frame) {
        placements.set(frame.id, {
          x: x + (columnWidths[columnIndex] - frame.width) / 2,
          y: y + (rowHeights[rowIndex] - frame.height) / 2,
          width: frame.width,
          height: frame.height,
          rowIndex,
          columnIndex,
        });
        items.push(frame);
      }
      x += columnWidths[columnIndex] + spacing;
    }
    displayRows.push({ items, rowWidth: groupWidth, rowHeight: rowHeights[rowIndex], horizontalGap: spacing });
    y += rowHeights[rowIndex] + spacing;
  }

  const bounds = getPlacementBounds(placements);
  const rowPattern = displayRows.map((row) => row.items.length).join('-');
  return {
    ok: true,
    kind: 'grid',
    placements,
    rows: displayRows,
    rowCount: gridRows,
    columnCount: gridColumns,
    gridRows,
    gridColumns,
    rowPattern,
    minGap: spacing,
    spacing,
    usableWidth,
    usableHeight,
    groupWidth,
    groupHeight,
    groupArea: bounds.area,
    bounds,
    frameCount: sequence.length,
  };
}

function buildAlternatingReferenceCandidates(frames, wall, spacing) {
  const groups = new Map();
  frames.forEach((frame) => {
    const key = uniqueSizeKey(frame);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(frame);
  });
  const buckets = Array.from(groups.values()).map((bucket) => [...bucket].sort((a, b) => a.id - b.id));
  if (buckets.length !== 2) return [];
  buckets.sort((a, b) => b[0].width - a[0].width || b[0].height - a[0].height);
  const [wideFrames, narrowFrames] = buckets;
  if (wideFrames.length !== narrowFrames.length || wideFrames.length < 2) return [];

  const columnCount = wideFrames.length;
  const results = [];
  for (let startWide = 0; startWide <= 1; startWide += 1) {
    const rows = [[], []];
    for (let column = 0; column < columnCount; column += 1) {
      const wideOnTop = (column + startWide) % 2 === 0;
      rows[0].push(wideOnTop ? wideFrames[column] : narrowFrames[column]);
      rows[1].push(wideOnTop ? narrowFrames[column] : wideFrames[column]);
    }
    const raw = placeMatrixExactSpacing(rows, wall, spacing);
    if (raw) {
      raw.kind = 'grid';
      raw.gridRows = 2;
      raw.gridColumns = columnCount;
      raw.referenceStyle = true;
      raw.mustKeep = true;
      raw.rowPattern = rows.map((row) => row.length).join('-');
      results.push(raw);
    }
  }
  return results;
}

function scoreCandidate(candidate, wall) {
  if (candidate.invalidReason) return Number.NEGATIVE_INFINITY;
  const usableWidth = Math.max(1, wall.width - wall.innerMargin * 2);
  const usableHeight = Math.max(1, wall.height - wall.innerMargin * 2);
  const usableAspect = usableWidth / usableHeight;
  const groupAspect = Math.max(0.001, candidate.groupWidth / Math.max(1, candidate.groupHeight));
  const rowWidths = candidate.rows.map((row) => row.rowWidth || candidate.groupWidth);
  const rowCounts = candidate.rows.map((row) => row.items.length);
  const widthBalance = standardDeviation(rowWidths) / usableWidth;
  const countBalance = standardDeviation(rowCounts) / Math.max(1, candidate.rows.length);
  const aspectPenalty = Math.abs(Math.log(groupAspect / Math.max(0.001, usableAspect)));
  const compactRatio = candidate.groupArea / Math.max(1, usableWidth * usableHeight);
  const fillWidth = candidate.groupWidth / usableWidth;
  const fillHeight = candidate.groupHeight / usableHeight;
  const comfortableFillPenalty = Math.abs(fillWidth - 0.68) * 70 + Math.abs(fillHeight - 0.45) * 55;
  const gridBonus = candidate.kind === 'grid' ? 110 : 0;
  const staggerBonus = candidate.kind === 'grid' && candidate.gridRows * candidate.gridColumns > candidate.frameCount ? 95 : 0;
  const matrixBonus = candidate.kind === 'matrix' ? 60 : 0;
  const columnsBonus = candidate.kind === 'columns' ? 25 : 0;
  const referenceBonus = candidate.referenceStyle ? 100000 : 0;
  const mustKeepBonus = candidate.mustKeep ? 50000 : 0;
  const rowPatternBonus = candidate.rowPattern === '4-4' ? 220 : candidate.rowPattern === '3-2-3' || candidate.rowPattern === '2-4-2' ? 150 : 0;

  return (
    referenceBonus +
    mustKeepBonus +
    gridBonus +
    staggerBonus +
    matrixBonus +
    columnsBonus +
    rowPatternBonus -
    widthBalance * 900 -
    countBalance * 360 -
    aspectPenalty * 90 -
    compactRatio * 80 -
    comfortableFillPenalty
  );
}

function finalizeCandidate(raw, wall, indexInSearch) {
  const rows = raw.rows.map((row) => row.items);
  const referenceStyle = Boolean(raw.referenceStyle) || isReferenceAlternatingRows(rows);
  const signature = signatureForPlacements(raw.placements);
  const name = layoutNameFor({ ...raw, referenceStyle }, rows);
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
    key: `${raw.kind}:${raw.gridRows ?? ''}x${raw.gridColumns ?? ''}:${raw.rowPattern}:${signature}`,
    name,
    metrics,
    searchOrder: indexInSearch,
  };
}

function candidateFamilyKey(candidate) {
  if (candidate.referenceStyle) return 'reference';
  if (candidate.kind === 'grid') {
    const empties = (candidate.gridRows || 0) * (candidate.gridColumns || 0) - candidate.frameCount;
    return `grid:${candidate.gridRows}x${candidate.gridColumns}:e${empties}`;
  }
  return `${candidate.kind}:${candidate.rowPattern}`;
}

function selectCandidates(candidates, compactRequired) {
  if (!candidates.length) return [];
  let pool = candidates;

  if (compactRequired) {
    const minArea = Math.min(...pool.map((candidate) => candidate.groupArea));
    const tolerance = Math.max(1, minArea * 0.002);
    pool = pool.filter((candidate) => candidate.groupArea <= minArea + tolerance);
  }

  const sorted = [...pool].sort((a, b) => b.metrics.score - a.metrics.score || a.groupArea - b.groupArea || a.searchOrder - b.searchOrder);
  const selected = [];
  const selectedKeys = new Set();
  const familyCounts = new Map();

  function add(candidate) {
    if (!candidate || selectedKeys.has(candidate.key)) return false;
    selected.push(candidate);
    selectedKeys.add(candidate.key);
    const family = candidateFamilyKey(candidate);
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    return true;
  }

  sorted.filter((candidate) => candidate.mustKeep || candidate.referenceStyle).forEach(add);

  for (const candidate of sorted) {
    if (selected.length >= Math.min(MAX_CANDIDATES_TO_SHOW, 28)) break;
    const family = candidateFamilyKey(candidate);
    if ((familyCounts.get(family) || 0) === 0) add(candidate);
  }

  for (const candidate of sorted) {
    if (selected.length >= Math.min(MAX_CANDIDATES_TO_SHOW, 40)) break;
    const family = candidateFamilyKey(candidate);
    if ((familyCounts.get(family) || 0) < 2) add(candidate);
  }

  for (const candidate of sorted) {
    if (selected.length >= MAX_CANDIDATES_TO_SHOW) break;
    add(candidate);
  }

  return selected;
}

function computeLayoutCandidates(frames, wall, settings = state.layoutSettings) {
  const spacing = Math.max(0, Number(settings.spacing) || 0);
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  const emptyStats = { visualPermutations: 0, estimatedPermutations: 0, rowPatterns: 0, gridPatterns: 0, checked: 0, unique: 0, truncated: false };

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
  const gridSpecs = generateGridSpecs(frames.length);
  const gridMasksBySpec = new Map();
  gridSpecs.forEach((spec) => {
    gridMasksBySpec.set(`${spec.rows}x${spec.columns}`, generateGridMasks(spec.rows, spec.columns, frames.length));
  });

  const candidates = [];
  const seen = new Set();
  let checked = 0;
  let stoppedForWorkLimit = false;
  const maxChecks = frames.length <= 8 ? 600000 : frames.length <= 10 ? 280000 : 140000;

  function keep(raw) {
    checked += 1;
    if (!raw) return;
    const candidate = finalizeCandidate(raw, wall, checked);
    if (seen.has(candidate.signature)) return;
    seen.add(candidate.signature);
    candidates.push(candidate);
  }

  buildAlternatingReferenceCandidates(frames, wall, spacing).forEach((raw) => keep(raw));

  outer:
  for (const sequence of sequences) {
    for (const counts of compositions) {
      const rows = sliceByCounts(sequence, counts);
      keep(placeRowsExactSpacing(rows, wall, spacing, 'rows'));

      if (rows.length > 1 && rows.every((row) => row.length === rows[0].length)) {
        keep(placeMatrixExactSpacing(rows, wall, spacing));
      }

      if (counts.length > 1) {
        keep(placeColumnsExactSpacing(sliceByCounts(sequence, counts), wall, spacing));
      }

      if (checked > maxChecks) {
        stoppedForWorkLimit = true;
        break outer;
      }
    }

    for (const spec of gridSpecs) {
      const masks = gridMasksBySpec.get(`${spec.rows}x${spec.columns}`) || [];
      for (const mask of masks) {
        keep(placeGridExactSpacing(sequence, mask, spec.rows, spec.columns, wall, spacing));
        if (checked > maxChecks) {
          stoppedForWorkLimit = true;
          break outer;
        }
      }
    }
  }

  state.searchStats = {
    visualPermutations: sequences.length,
    estimatedPermutations: estimated,
    rowPatterns: compositions.length,
    gridPatterns: gridSpecs.reduce((sum, spec) => sum + (gridMasksBySpec.get(`${spec.rows}x${spec.columns}`)?.length || 0), 0),
    checked,
    unique: candidates.length,
    truncated: truncated || stoppedForWorkLimit,
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
  const incomingThickness = Number(nextLayoutSettings.frameThickness);
  const resolvedThickness = Number.isFinite(incomingThickness) && incomingThickness >= 0
    ? incomingThickness
    : (state.layoutSettings.frameThickness ?? DEFAULT_FRAME_THICKNESS);
  state.layoutSettings = {
    spacing: Math.max(0, Number(nextLayoutSettings.spacing) || 0),
    frameThickness: resolvedThickness,
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
    photoDataUrl: null,
    photoName: '',
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

function getPlacedFramesForActiveLayout() {
  const activeLayout = getActiveLayout();
  if (!activeLayout || activeLayout.invalidReason) return [];
  return state.frames
    .map((frame) => {
      const placement = activeLayout.placements.get(frame.id);
      if (!placement) return null;
      return {
        frame,
        placement,
        rowIndex: Number.isFinite(placement.rowIndex) ? placement.rowIndex : 0,
        columnIndex: Number.isFinite(placement.columnIndex) ? placement.columnIndex : 0,
      };
    })
    .filter(Boolean);
}

function getInstructionRows(placed) {
  const rowsByIndex = new Map();
  placed.forEach((item) => {
    const rowKey = Number.isFinite(item.placement.rowIndex) ? item.placement.rowIndex : Math.round(item.placement.y * 1000) / 1000;
    if (!rowsByIndex.has(rowKey)) rowsByIndex.set(rowKey, []);
    rowsByIndex.get(rowKey).push(item);
  });

  return Array.from(rowsByIndex.entries())
    .map(([rowKey, items]) => ({
      rowKey,
      items: items.sort((a, b) => a.columnIndex - b.columnIndex || a.placement.x - b.placement.x || a.frame.id - b.frame.id),
      minY: Math.min(...items.map((item) => item.placement.y)),
      minX: Math.min(...items.map((item) => item.placement.x)),
    }))
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX || Number(a.rowKey) - Number(b.rowKey));
}

function coordinateCopy(x, y) {
  return `${formatNumber(x)} mm from left, ${formatNumber(y)} mm from top`;
}

function deltaCopy(dx, dy) {
  return `ΔX ${formatNumber(dx)} mm, ΔY ${formatNumber(dy)} mm`;
}

function renderPlacementInstructions() {
  if (!els.placementInstructions) return;
  const activeLayout = getActiveLayout();

  if (!activeLayout) {
    els.placementInstructions.className = 'placement-instructions empty-state';
    els.placementInstructions.textContent = 'No layout is available yet.';
    return;
  }

  if (activeLayout.invalidReason) {
    els.placementInstructions.className = 'placement-instructions empty-state';
    els.placementInstructions.textContent = activeLayout.invalidReason;
    return;
  }

  const placed = getPlacedFramesForActiveLayout();
  if (!placed.length) {
    els.placementInstructions.className = 'placement-instructions empty-state';
    els.placementInstructions.textContent = 'Add picture frames to see placement measurements.';
    return;
  }

  const rows = getInstructionRows(placed);
  const firstItem = rows[0]?.items[0];
  const ordered = rows.flatMap((row) => row.items);
  const bounds = activeLayout.bounds ?? getPlacementBounds(activeLayout.placements);
  if (!firstItem) return;

  const steps = [];
  let previousRowStart = null;
  rows.forEach((row, rowNumber) => {
    const rowStart = row.items[0];
    if (!rowStart) return;

    if (rowNumber === 0) {
      steps.push(`<li><strong>${escapeHtml(rowStart.frame.name)}</strong>: start here. Top-left point is ${coordinateCopy(rowStart.placement.x, rowStart.placement.y)} from the wall area.</li>`);
    } else {
      const dx = rowStart.placement.x - previousRowStart.placement.x;
      const dy = rowStart.placement.y - previousRowStart.placement.y;
      steps.push(`<li><strong>${escapeHtml(rowStart.frame.name)}</strong>: start row ${rowNumber + 1}. Top-left point is ${coordinateCopy(rowStart.placement.x, rowStart.placement.y)}. From the previous row start: ${deltaCopy(dx, dy)}.</li>`);
    }

    row.items.forEach((item, itemIndex) => {
      if (itemIndex === 0) return;
      const previous = row.items[itemIndex - 1];
      const dx = item.placement.x - previous.placement.x;
      const dy = item.placement.y - previous.placement.y;
      const edgeGap = item.placement.x - (previous.placement.x + previous.placement.width);
      steps.push(`<li><strong>${escapeHtml(item.frame.name)}</strong>: from <strong>${escapeHtml(previous.frame.name)}</strong> top-left to this top-left: ${deltaCopy(dx, dy)}. Clear edge gap: ${formatNumber(edgeGap)} mm.</li>`);
    });

    previousRowStart = rowStart;
  });

  const tableRows = ordered
    .map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.frame.name)}</td>
        <td>${formatNumber(item.placement.x)}</td>
        <td>${formatNumber(item.placement.y)}</td>
        <td>${formatNumber(item.placement.width)} × ${formatNumber(item.placement.height)}</td>
      </tr>
    `)
    .join('');

  els.placementInstructions.className = 'placement-instructions';
  els.placementInstructions.innerHTML = `
    <div class="instruction-summary">
      <div><strong>Origin:</strong> top-left corner of the full measured wall area.</div>
      <div><strong>First top-left point:</strong> ${escapeHtml(firstItem.frame.name)} at ${coordinateCopy(firstItem.placement.x, firstItem.placement.y)}.</div>
      <div><strong>Layout footprint:</strong> ${formatNumber(bounds.width)} × ${formatNumber(bounds.height)} mm, starting ${coordinateCopy(bounds.left, bounds.top)}.</div>
      <div><strong>Photo dimensions:</strong> all width/height values are outer frame dimensions, including the frame.</div>
      <div><strong>Photo edge spacing:</strong> ${formatNumber(state.layoutSettings.spacing)} mm minimum between neighbouring outer frame edges.</div>
    </div>

    <h4>Top-left placement sequence</h4>
    <ol class="instruction-steps">
      ${steps.join('')}
    </ol>

    <h4>Exact top-left coordinates</h4>
    <div class="instruction-table-wrap">
      <table class="instruction-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Photo</th>
            <th>Left mm</th>
            <th>Top mm</th>
            <th>Size mm</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
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
    <div><strong>Frame thickness:</strong> ${formatNumber(state.layoutSettings.frameThickness ?? DEFAULT_FRAME_THICKNESS)} ${state.wall.unit}</div>
    <div><strong>Photo edge spacing:</strong> ${formatNumber(state.layoutSettings.spacing)} ${state.wall.unit}</div>
    <div><strong>Compact only:</strong> ${state.layoutSettings.compact ? 'Yes' : 'No'}</div>
    <div><strong>Usable area:</strong> ${areaLabel(usableWidth, usableHeight, state.wall.unit)}</div>
    <div><strong>Frames:</strong> ${state.frames.length}</div>
    <div><strong>Filled area:</strong> ${fillPct}%</div>
    <div><strong>Active layout:</strong> ${escapeHtml(layoutLine)}</div>
    <div><strong>Photo:</strong> ${photoLine}</div>
  `;
}

function getFrameById(frameId) {
  return state.frames.find((frame) => frame.id === frameId) ?? null;
}

function startFrameImagePicker(frameId) {
  const frame = getFrameById(frameId);
  if (!frame) {
    showMessage('That frame could not be found.', 'error');
    return;
  }
  state.pendingFrameImageId = frameId;
  if (els.frameImageInput) {
    els.frameImageInput.value = '';
    els.frameImageInput.click();
  }
}

async function handleFrameImageChange(event) {
  const file = event.target.files?.[0];
  const frameId = state.pendingFrameImageId;
  state.pendingFrameImageId = null;
  if (!file || !frameId) return;

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const resized = await resizeImageDataUrl(dataUrl, 1200, 0.88);
    const frame = getFrameById(frameId);
    if (!frame) {
      showMessage('That frame no longer exists.', 'error');
      return;
    }
    frame.photoDataUrl = resized;
    frame.photoName = file.name || '';
    render();
    persistState();
    showMessage(`Photo added to “${frame.name}”. The uploaded image is treated as the full outer frame image.`, 'info');
  } catch (error) {
    showMessage('Could not load that frame photo. Try a smaller image or another file.', 'error');
  }
}

function removeFrameImage(frameId) {
  const frame = getFrameById(frameId);
  if (!frame) return;
  frame.photoDataUrl = null;
  frame.photoName = '';
  render();
  persistState();
  showMessage(`Photo removed from “${frame.name}”.`, 'info');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('FileReadError'));
    reader.readAsDataURL(file);
  });
}

function openFrameActionSheet(frameId) {
  const frame = getFrameById(frameId);
  if (!frame || !els.frameActionModal) return;
  state.frameActionFrameId = frameId;
  const orderIndex = state.frames.findIndex((candidate) => candidate.id === frameId);
  const number = orderIndex >= 0 ? orderIndex + 1 : 1;
  if (els.frameActionNumber) els.frameActionNumber.textContent = String(number);
  if (els.frameActionTitle) els.frameActionTitle.textContent = frame.name;
  const photoNote = frame.photoDataUrl ? ' • photo set' : '';
  if (els.frameActionMeta) {
    els.frameActionMeta.textContent = `${areaLabel(frame.width, frame.height, state.wall.unit)} outer size${photoNote}`;
  }
  if (els.frameActionPhoto) {
    els.frameActionPhoto.textContent = frame.photoDataUrl ? 'Replace photo' : 'Add photo';
  }
  if (els.frameActionRemovePhoto) {
    els.frameActionRemovePhoto.classList.toggle('hidden', !frame.photoDataUrl);
  }
  openModal(els.frameActionModal);
}

function closeFrameActionSheet() {
  state.frameActionFrameId = null;
  if (els.frameActionModal) closeModal(els.frameActionModal);
}

function handleFrameActionPhoto() {
  const id = state.frameActionFrameId;
  closeFrameActionSheet();
  if (id != null) startFrameImagePicker(id);
}

function handleFrameActionRemovePhoto() {
  const id = state.frameActionFrameId;
  closeFrameActionSheet();
  if (id != null) removeFrameImage(id);
}

function handleFrameActionRemove() {
  const id = state.frameActionFrameId;
  closeFrameActionSheet();
  if (id != null) removeFrame(id);
}

function renderFrameStrip() {
  if (!els.frameStrip) return;
  if (!state.frames.length) {
    els.frameStrip.className = 'frame-strip empty-state';
    els.frameStrip.textContent = 'Add frames to access them here.';
    return;
  }
  els.frameStrip.className = 'frame-strip';
  els.frameStrip.innerHTML = '';
  state.frames.forEach((frame, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'frame-strip-card';
    if (frame.photoDataUrl) card.classList.add('has-photo');
    card.dataset.frameId = String(frame.id);
    card.setAttribute('role', 'listitem');
    const photoNote = frame.photoDataUrl ? ' • photo set' : '';
    card.innerHTML = `
      <span class="frame-strip-badge">${index + 1}</span>
      <span class="frame-strip-meta-block">
        <span class="frame-strip-name">${escapeHtml(frame.name)}</span>
        <span class="frame-strip-meta">${formatNumber(frame.width)} × ${formatNumber(frame.height)} mm${photoNote}</span>
      </span>
    `;
    card.addEventListener('click', () => openFrameActionSheet(frame.id));
    els.frameStrip.appendChild(card);
  });
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
    const photoStatus = frame.photoDataUrl ? `Photo saved${frame.photoName ? `: ${escapeHtml(frame.photoName)}` : ''}` : 'No custom photo yet';
    item.innerHTML = `
      <div class="frame-meta">
        <strong>${escapeHtml(frame.name)}</strong>
        <span>${areaLabel(frame.width, frame.height, state.wall.unit)} outer size, including frame</span>
        <span>${photoStatus}</span>
      </div>
      <div class="frame-item-actions">
        <button type="button" class="button-secondary" data-photo-id="${frame.id}">${frame.photoDataUrl ? 'Replace photo' : 'Add photo'}</button>
        ${frame.photoDataUrl ? `<button type="button" class="button-secondary" data-clear-photo-id="${frame.id}">Remove photo</button>` : ''}
        <button type="button" class="button-secondary" data-remove-id="${frame.id}">Remove frame</button>
      </div>
    `;
    els.frameList.appendChild(item);
  });
  els.frameList.querySelectorAll('[data-photo-id]').forEach((button) => {
    button.addEventListener('click', () => startFrameImagePicker(Number(button.dataset.photoId)));
  });
  els.frameList.querySelectorAll('[data-clear-photo-id]').forEach((button) => {
    button.addEventListener('click', () => removeFrameImage(Number(button.dataset.clearPhotoId)));
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
    els.layoutProgress.textContent = `Search checked ${stats.checked.toLocaleString()} arrangements from ${stats.visualPermutations.toLocaleString()} visual size-order permutations, ${Number(stats.rowPatterns || 0).toLocaleString()} row patterns, and ${Number(stats.gridPatterns || 0).toLocaleString()} grid masks; kept ${stats.unique.toLocaleString()} unique geometries${truncatedCopy}.`;
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

  state.frames.forEach((frame, frameIndex) => {
    const placement = activeLayout.placements.get(frame.id);
    if (!placement) return;
    const frameEl = document.createElement('button');
    frameEl.type = 'button';
    frameEl.className = 'wall-frame';
    if (frame.photoDataUrl) frameEl.classList.add('has-custom-photo');
    const renderedWidth = placement.width * scaleX;
    const renderedHeight = placement.height * scaleY;
    if (renderedWidth < 54 || renderedHeight < 42) frameEl.classList.add('frame-compact');
    if (renderedWidth < 38 || renderedHeight < 32) frameEl.classList.add('frame-tiny');

    // Visible frame depth in screen pixels = real frame thickness × scale,
    // clamped down so it never exceeds half of the smaller frame side.
    const realFrameThicknessMm = state.layoutSettings.frameThickness ?? DEFAULT_FRAME_THICKNESS;
    const computedThicknessPx = realFrameThicknessMm * Math.min(scaleX, scaleY);
    const maxAllowedThicknessPx = Math.max(1, Math.min(renderedWidth, renderedHeight) / 2 - 1);
    const thicknessPx = Math.max(1, Math.min(computedThicknessPx, maxAllowedThicknessPx));

    frameEl.style.left = `${placement.x * scaleX}px`;
    frameEl.style.top = `${placement.y * scaleY}px`;
    frameEl.style.width = `${renderedWidth}px`;
    frameEl.style.height = `${renderedHeight}px`;
    frameEl.style.setProperty('--frame-inner-inset', `${thicknessPx}px`);
    frameEl.title = `Manage ${frame.name}`;
    frameEl.setAttribute('aria-label', `Frame ${frameIndex + 1}: ${frame.name}. Tap to manage.`);
    frameEl.addEventListener('click', () => openFrameActionSheet(frame.id));

    if (frame.photoDataUrl) {
      const image = document.createElement('img');
      image.className = 'frame-photo-image';
      image.src = frame.photoDataUrl;
      image.alt = `${frame.name} uploaded frame photo`;
      frameEl.appendChild(image);
    } else {
      const label = document.createElement('span');
      label.textContent = frame.name;
      frameEl.appendChild(label);
    }

    // Numbered badge sits above the photo / matte so it's always visible.
    const badge = document.createElement('span');
    badge.className = 'frame-badge';
    badge.textContent = String(frameIndex + 1);
    badge.setAttribute('aria-hidden', 'true');
    frameEl.appendChild(badge);

    els.frameLayer.appendChild(frameEl);
  });
}

function render() {
  updateEditWallAreaButton();
  updatePhotoPreview();
  renderSummary();
  renderFrameList();
  renderFrameStrip();
  renderLayoutToolbar();
  renderPlacementInstructions();
  renderWall();
  if (state.pendingCrop) renderCropSelection();
  showMessage(state.lastMessage.text, state.lastMessage.type);
}

function handleModalScrimClick(event) {
  const closeType = event.target instanceof HTMLElement ? event.target.dataset.closeModal : null;
  if (closeType === 'camera') stopCamera();
  if (closeType === 'crop') closeCropEditor();
  if (closeType === 'frame-action') closeFrameActionSheet();
}

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  if (els.frameActionModal && !els.frameActionModal.classList.contains('hidden')) {
    closeFrameActionSheet();
    return;
  }
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
  if (els.frameThickness) els.frameThickness.value = formatNumber(state.layoutSettings.frameThickness ?? DEFAULT_FRAME_THICKNESS);
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
  if (els.frameImageInput) els.frameImageInput.addEventListener('change', handleFrameImageChange);
  [els.frameName, els.frameWidth, els.frameHeight, els.frameQuantity].forEach((input) => input.addEventListener('change', persistDraftFrame));
  if (els.frameSpacing) {
    els.frameSpacing.addEventListener('input', () => {
      state.spacingWasManuallyEdited = true;
    });
  }
  if (els.frameThickness) {
    els.frameThickness.addEventListener('input', () => {
      if (!state.spacingWasManuallyEdited && els.frameSpacing) {
        els.frameSpacing.value = formatNumber(getRecommendedSpacing(Number(els.frameThickness.value)));
      }
    });
  }
  [els.frameSpacing, els.frameThickness, els.compactLayout].filter(Boolean).forEach((input) => {
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
  if (els.frameActionModal) {
    els.frameActionModal.addEventListener('click', handleModalScrimClick);
  }
  if (els.frameActionPhoto) els.frameActionPhoto.addEventListener('click', handleFrameActionPhoto);
  if (els.frameActionRemovePhoto) els.frameActionRemovePhoto.addEventListener('click', handleFrameActionRemovePhoto);
  if (els.frameActionRemove) els.frameActionRemove.addEventListener('click', handleFrameActionRemove);
  if (els.frameActionCancel) els.frameActionCancel.addEventListener('click', closeFrameActionSheet);
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
