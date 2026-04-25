const MIN_CROP_SIZE = 0.12;
const STORAGE_KEY = 'wall-picture-planner-v4';
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.84;

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
  draftFrame: {
    name: 'Picture',
    width: 300,
    height: 400,
    quantity: 1,
  },
  layoutCandidates: [],
  selectedLayoutIndex: 0,
  selectedLayoutKey: null,
  cameraStream: null,
  pendingCrop: null,
  cropInteraction: null,
  lastMessage: {
    type: 'info',
    text: 'Ready. Enter the wall size, then take a photo or choose one from your gallery.',
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
    x: 0.03,
    y: 0.03,
    w: 0.94,
    h: 0.94,
  };
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
    w = h * wallAspect / imageAspect;
  } else {
    w = usableWidth;
    h = w / wallAspect * imageAspect;
  }

  w = clamp(w, MIN_CROP_SIZE, 1);
  h = clamp(h, MIN_CROP_SIZE, 1);

  return {
    x: clamp((1 - w) / 2, 0, 1 - w),
    y: clamp((1 - h) / 2, 0, 1 - h),
    w,
    h,
  };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showMessage(text, type = 'info') {
  state.lastMessage = { text, type };
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

function persistState() {
  try {
    const activeLayout = getActiveLayout();
    const payload = {
      version: 5,
      wall: state.wall,
      frames: state.frames,
      nextId: state.nextId,
      selectedLayoutKey: activeLayout?.key ?? null,
      draftFrame: getCurrentFrameDraft(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    showMessage('The browser could not save everything locally. Some data may not persist after refresh.', 'error');
  }
}

function getCurrentFrameDraft() {
  return {
    name: els.frameName?.value.trim() || state.draftFrame.name || 'Picture',
    width: Number(els.frameWidth?.value) || state.draftFrame.width || 300,
    height: Number(els.frameHeight?.value) || state.draftFrame.height || 400,
    quantity: Math.max(1, Math.floor(Number(els.frameQuantity?.value) || state.draftFrame.quantity || 1)),
  };
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
                x: clamp(Number(parsed.wall.cropSelection.x) || 0.08, 0, 1),
                y: clamp(Number(parsed.wall.cropSelection.y) || 0.08, 0, 1),
                w: clamp(Number(parsed.wall.cropSelection.w) || 0.84, MIN_CROP_SIZE, 1),
                h: clamp(Number(parsed.wall.cropSelection.h) || 0.84, MIN_CROP_SIZE, 1),
              }
            : null,
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

function getFrameArea(frame) {
  return frame.width * frame.height;
}

function getCenterOutIndexes(length, flipped = false) {
  const indexes = [];
  if (length <= 0) return indexes;

  if (length % 2 === 1) {
    const center = Math.floor(length / 2);
    indexes.push(center);
    for (let offset = 1; offset <= center; offset += 1) {
      if (flipped) {
        indexes.push(center + offset, center - offset);
      } else {
        indexes.push(center - offset, center + offset);
      }
    }
    return indexes.filter((index) => index >= 0 && index < length);
  }

  const leftCenter = length / 2 - 1;
  const rightCenter = length / 2;
  indexes.push(flipped ? rightCenter : leftCenter, flipped ? leftCenter : rightCenter);
  for (let offset = 1; offset <= leftCenter; offset += 1) {
    if (flipped) {
      indexes.push(rightCenter + offset, leftCenter - offset);
    } else {
      indexes.push(leftCenter - offset, rightCenter + offset);
    }
  }
  return indexes.filter((index) => index >= 0 && index < length);
}

function arrangeSymmetrically(items, variant = 0) {
  if (items.length <= 2) {
    return variant % 2 === 1 ? [...items].reverse() : [...items];
  }
  const sorted = [...items].sort((a, b) => {
    const areaDiff = getFrameArea(b) - getFrameArea(a);
    if (areaDiff !== 0) return areaDiff;
    return b.width - a.width || a.id - b.id;
  });
  const slots = new Array(sorted.length);
  const centerIndexes = getCenterOutIndexes(sorted.length, variant % 2 === 1);
  sorted.forEach((item, index) => {
    slots[centerIndexes[index]] = item;
  });
  const arranged = slots.filter(Boolean);
  return variant >= 2 ? arranged.reverse() : arranged;
}

function distributeCountsEvenly(total, parts) {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function centerBoostCounts(counts) {
  if (counts.length < 3) return counts;
  const boosted = [...counts];
  const centerIndexes = boosted.length % 2 === 1 ? [Math.floor(boosted.length / 2)] : [boosted.length / 2 - 1, boosted.length / 2];
  const donorIndexes = [];
  for (let i = 0; i < boosted.length; i += 1) {
    const fromEdge = Math.min(i, boosted.length - 1 - i);
    donorIndexes.push({ index: i, fromEdge });
  }
  donorIndexes.sort((a, b) => a.fromEdge - b.fromEdge || a.index - b.index);

  for (const donor of donorIndexes) {
    if (centerIndexes.includes(donor.index)) continue;
    if (boosted[donor.index] <= 1) continue;
    boosted[donor.index] -= 1;
    boosted[centerIndexes[0]] += 1;
    break;
  }
  return boosted;
}

function addCountPattern(patterns, seen, counts) {
  const cleaned = counts.map((count) => Number(count)).filter((count) => Number.isFinite(count) && count > 0);
  if (!cleaned.length) return;
  const key = cleaned.join('-');
  if (!seen.has(key)) {
    seen.add(key);
    patterns.push(cleaned);
  }
}

function getRowCountPatterns(total) {
  const patterns = [];
  const seen = new Set();
  const add = (counts) => addCountPattern(patterns, seen, counts);

  add([total]);

  const explicit = {
    2: [[1, 1]],
    3: [[1, 2], [2, 1], [1, 1, 1]],
    4: [[2, 2], [1, 2, 1], [1, 1, 1, 1]],
    5: [[2, 1, 2], [1, 3, 1], [2, 3], [3, 2]],
    6: [[3, 3], [2, 2, 2], [2, 1, 3], [3, 1, 2], [1, 4, 1]],
    7: [[3, 1, 3], [2, 3, 2], [2, 2, 3], [3, 2, 2], [1, 2, 2, 2]],
    8: [[4, 4], [3, 2, 3], [2, 4, 2], [2, 3, 3], [3, 3, 2], [1, 3, 3, 1], [2, 2, 2, 2]],
    9: [[3, 3, 3], [2, 3, 4], [4, 3, 2], [2, 2, 3, 2], [1, 3, 3, 2]],
    10: [[5, 5], [3, 4, 3], [2, 3, 3, 2], [2, 2, 2, 2, 2]],
  };

  (explicit[total] || []).forEach(add);

  const maxRows = Math.min(total, 5);
  for (let rows = 2; rows <= maxRows; rows += 1) {
    const base = distributeCountsEvenly(total, rows);
    add(base);
    add([...base].reverse());
    add(centerBoostCounts(base));
    add(centerBoostCounts([...base].reverse()));
  }

  return patterns;
}


function interleaveExtremes(frames, startWithLargest = true) {
  const sorted = [...frames].sort((a, b) => getFrameArea(b) - getFrameArea(a) || b.width - a.width || a.id - b.id);
  const result = [];
  let left = 0;
  let right = sorted.length - 1;
  let takeLargest = startWithLargest;

  while (left <= right) {
    if (takeLargest) {
      result.push(sorted[left]);
      left += 1;
    } else {
      result.push(sorted[right]);
      right -= 1;
    }
    takeLargest = !takeLargest;
  }

  return result;
}

function getOrderingVariants(frames) {
  const byAreaDesc = [...frames].sort((a, b) => getFrameArea(b) - getFrameArea(a) || b.width - a.width || a.id - b.id);
  const byAreaAsc = [...byAreaDesc].reverse();
  const wideFirst = [...frames].sort((a, b) => b.width - a.width || getFrameArea(b) - getFrameArea(a) || a.id - b.id);
  const narrowFirst = [...wideFirst].reverse();
  const highLow = interleaveExtremes(frames, true);
  const lowHigh = interleaveExtremes(frames, false);

  const portraits = byAreaDesc.filter((frame) => frame.height > frame.width);
  const landscapes = byAreaDesc.filter((frame) => frame.width >= frame.height);
  const alternatingOrientation = [];
  while (portraits.length || landscapes.length) {
    if (landscapes.length) alternatingOrientation.push(landscapes.shift());
    if (portraits.length) alternatingOrientation.push(portraits.shift());
  }

  const bySquareness = [...frames].sort((a, b) => {
    const da = Math.abs(a.width / a.height - 1);
    const db = Math.abs(b.width / b.height - 1);
    return da - db || getFrameArea(b) - getFrameArea(a) || a.id - b.id;
  });

  return [
    { key: 'high-low', name: 'large-small mix', frames: highLow },
    { key: 'low-high', name: 'small-large mix', frames: lowHigh },
    { key: 'wide-first', name: 'wide frame anchors', frames: wideFirst },
    { key: 'narrow-first', name: 'narrow frame anchors', frames: narrowFirst },
    { key: 'area-desc', name: 'large frame anchors', frames: byAreaDesc },
    { key: 'area-asc', name: 'light-to-heavy gallery', frames: byAreaAsc },
    { key: 'orientation-mix', name: 'orientation mix', frames: alternatingOrientation.length ? alternatingOrientation : highLow },
    { key: 'square-first', name: 'shape-balanced mix', frames: bySquareness },
  ];
}


function sliceFramesByCounts(frames, counts) {
  const groups = [];
  let cursor = 0;
  for (const count of counts) {
    groups.push(frames.slice(cursor, cursor + count));
    cursor += count;
  }
  return groups;
}

function getLayoutPatternName(counts, transpose = false) {
  const key = counts.join('-');
  const names = {
    '4-4': 'Two-row grid',
    '3-2-3': 'Salon stagger',
    '2-4-2': 'Centered showcase band',
    '2-3-3': 'Left-weighted gallery',
    '3-3-2': 'Right-weighted gallery',
    '1-3-3-1': 'Diamond gallery',
    '2-2-2-2': 'Column pairs',
    '3-3-3': 'Nine-frame grid',
    '2-3-2': 'Centered trio gallery',
    '1-4-1': 'Wide center band',
    '2-2-2': 'Three stacked pairs',
  };
  const baseName = names[key] ?? `${counts.length}-row gallery`;
  return transpose ? `${baseName} columns` : baseName;
}

function arrangeRowsVertically(rowGroups, variant = 0) {
  if (rowGroups.length <= 2) {
    return variant % 2 === 1 ? [...rowGroups].reverse() : rowGroups;
  }

  const entries = rowGroups.map((group, index) => ({
    id: index,
    width: group.reduce((sum, frame) => sum + frame.width, 0),
    height: group.reduce((max, frame) => Math.max(max, frame.height), 0),
    group,
  }));

  if (variant === 0) return entries.map((entry) => entry.group);
  if (variant === 1) return [...entries].reverse().map((entry) => entry.group);

  return arrangeSymmetrically(entries, variant - 2).map((entry) => entry.group);
}

function assignRowsByGreedyWidth(frames, counts) {
  const rows = counts.map(() => []);
  const rowWidths = counts.map(() => 0);
  const ordered = [...frames].sort((a, b) => getFrameArea(b) - getFrameArea(a) || b.width - a.width || a.id - b.id);

  ordered.forEach((frame) => {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    counts.forEach((count, index) => {
      if (rows[index].length >= count) return;
      const fillRatio = rows[index].length / count;
      const centerPenalty = Math.abs(index - (counts.length - 1) / 2) * 0.001;
      const score = rowWidths[index] + fillRatio * 50 + centerPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      rows[bestIndex].push(frame);
      rowWidths[bestIndex] += frame.width;
    }
  });

  return rows;
}

function assignRowsByOuterMirror(frames, counts) {
  const rows = counts.map(() => []);
  const ordered = interleaveExtremes(frames, true);
  const slotOrder = [];
  const rowOrder = getCenterOutIndexes(counts.length, false);

  while (slotOrder.length < frames.length) {
    for (const rowIndex of rowOrder) {
      const alreadyReserved = rows[rowIndex].length + slotOrder.filter((index) => index === rowIndex).length;
      if (alreadyReserved < counts[rowIndex]) {
        slotOrder.push(rowIndex);
      }
      if (slotOrder.length >= frames.length) break;
    }
  }

  ordered.forEach((frame, index) => {
    rows[slotOrder[index]].push(frame);
  });

  return rows;
}

function assignRowsByCounts(frames, counts, mode = 'slice') {
  if (mode === 'greedy-width') return assignRowsByGreedyWidth(frames, counts);
  if (mode === 'outer-mirror') return assignRowsByOuterMirror(frames, counts);
  if (mode === 'reverse-slice') return sliceFramesByCounts([...frames].reverse(), counts);

  const groups = sliceFramesByCounts(frames, counts);
  if (mode === 'snake') {
    return groups.map((group, index) => (index % 2 === 1 ? [...group].reverse() : group));
  }
  if (mode === 'reverse-snake') {
    return groups.map((group, index) => (index % 2 === 0 ? [...group].reverse() : group));
  }
  return groups;
}

function getAssignmentModes() {
  return [
    { key: 'slice', label: 'ordered' },
    { key: 'snake', label: 'staggered' },
    { key: 'reverse-slice', label: 'inverted' },
    { key: 'greedy-width', label: 'width-balanced' },
    { key: 'outer-mirror', label: 'mirror-balanced' },
  ];
}

function getLayoutFamilyRank(candidate) {
  const rankByPattern = {
    '2-4-2': 0,
    '3-2-3': 1,
    '4-4': 2,
    '1-3-3-1': 3,
    '2-2-2-2': 4,
    '3-3-2': 5,
    '2-3-3': 6,
  };
  const patternRank = rankByPattern[candidate.rowPattern] ?? 20;
  const transposeBonus = candidate.transpose ? 0.25 : 0;
  return patternRank + transposeBonus;
}

function selectDiverseCandidates(candidates, maxCandidates = 24) {
  const forced = candidates
    .filter((candidate) => candidate.forceInclude)
    .sort((a, b) => (a.forceRank ?? 0) - (b.forceRank ?? 0) || b.metrics.score - a.metrics.score);
  const sorted = [...candidates].sort((a, b) => b.metrics.score - a.metrics.score);
  const picked = [];
  const usedSignatures = new Set();
  const usedFamily = new Set();

  const addCandidate = (candidate) => {
    if (!candidate || usedSignatures.has(candidate.signature)) return false;
    usedSignatures.add(candidate.signature);
    picked.push(candidate);
    return true;
  };

  forced.forEach((candidate) => {
    if (picked.length >= maxCandidates) return;
    if (addCandidate(candidate)) usedFamily.add(candidate.familyKey);
  });

  const patternOrder = ['4-4', '2-4-2', '3-2-3', '1-3-3-1', '2-2-2-2', '3-3-2', '2-3-3'];
  patternOrder.forEach((pattern) => {
    if (picked.length >= maxCandidates) return;
    const bestForPattern = sorted.find((candidate) => candidate.rowPattern === pattern && !candidate.transpose && !candidate.forceInclude) ??
      sorted.find((candidate) => candidate.rowPattern === pattern && !candidate.forceInclude);
    if (bestForPattern) {
      addCandidate(bestForPattern);
      usedFamily.add(bestForPattern.familyKey);
    }
  });

  const byFamily = [...sorted].sort((a, b) => getLayoutFamilyRank(a) - getLayoutFamilyRank(b) || b.metrics.score - a.metrics.score);
  for (const candidate of byFamily) {
    if (picked.length >= maxCandidates) break;
    if (usedFamily.has(candidate.familyKey)) continue;
    if (addCandidate(candidate)) usedFamily.add(candidate.familyKey);
  }

  for (const candidate of sorted) {
    if (picked.length >= maxCandidates) break;
    addCandidate(candidate);
  }

  return picked;
}

function placeMatrix(rowGroups, wall) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  const rowCount = rowGroups.length;
  const columnCount = rowGroups.reduce((max, row) => Math.max(max, row.length), 0);

  if (usableWidth <= 0 || usableHeight <= 0 || !rowCount || !columnCount) {
    return { ok: false, reason: 'No usable wall area is available for this gallery matrix.' };
  }

  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) =>
    rowGroups.reduce((max, row) => {
      const frame = row[columnIndex];
      return frame ? Math.max(max, frame.width) : max;
    }, 0)
  );
  const rowHeights = rowGroups.map((row) => row.reduce((max, frame) => Math.max(max, frame.height), 0));
  const totalColumnWidth = columnWidths.reduce((sum, value) => sum + value, 0);
  const totalRowHeight = rowHeights.reduce((sum, value) => sum + value, 0);

  if (totalColumnWidth > usableWidth) {
    return { ok: false, reason: 'The gallery matrix is too wide for the usable wall area.' };
  }
  if (totalRowHeight > usableHeight) {
    return { ok: false, reason: 'The gallery matrix is too tall for the usable wall area.' };
  }

  const horizontalGap = (usableWidth - totalColumnWidth) / (columnCount + 1);
  const verticalGap = (usableHeight - totalRowHeight) / (rowCount + 1);
  const placements = new Map();
  const rows = [];
  let currentY = wall.innerMargin + verticalGap;

  rowGroups.forEach((row, rowIndex) => {
    let currentX = wall.innerMargin + horizontalGap;
    rows.push({
      items: row,
      rowWidth: totalColumnWidth,
      rowHeight: rowHeights[rowIndex],
      horizontalGap,
      columnWidths: [...columnWidths],
    });

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const frame = row[columnIndex];
      const columnWidth = columnWidths[columnIndex];
      if (frame) {
        placements.set(frame.id, {
          x: currentX + (columnWidth - frame.width) / 2,
          y: currentY + (rowHeights[rowIndex] - frame.height) / 2,
          width: frame.width,
          height: frame.height,
          rowIndex,
          columnIndex,
        });
      }
      currentX += columnWidth + horizontalGap;
    }

    currentY += rowHeights[rowIndex] + verticalGap;
  });

  return {
    ok: true,
    usableWidth,
    usableHeight,
    placements,
    rows,
    minGap: Math.min(horizontalGap, verticalGap),
    verticalGap,
    horizontalGaps: Array.from({ length: rowCount }, () => horizontalGap),
    rowCount,
    columnCount,
  };
}

function getWideNarrowGroupsForEight(frames) {
  if (frames.length !== 8) return null;
  const sorted = [...frames].sort((a, b) => b.width - a.width || b.height - a.height || a.id - b.id);
  const wide = sorted.slice(0, 4);
  const narrow = sorted.slice(4).sort((a, b) => a.width - b.width || b.height - a.height || a.id - b.id);
  const avgWide = wide.reduce((sum, frame) => sum + frame.width, 0) / wide.length;
  const avgNarrow = narrow.reduce((sum, frame) => sum + frame.width, 0) / narrow.length;

  if (!Number.isFinite(avgWide) || !Number.isFinite(avgNarrow) || avgWide <= avgNarrow * 1.04) {
    return null;
  }

  return {
    wide: wide.sort((a, b) => a.id - b.id),
    narrow: narrow.sort((a, b) => a.id - b.id),
  };
}

function signatureForPlacements(placements) {
  return Array.from(placements.values())
    .map((placement) => ({
      x: Number(placement.x.toFixed(1)),
      y: Number(placement.y.toFixed(1)),
      width: Number(placement.width.toFixed(1)),
      height: Number(placement.height.toFixed(1)),
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height)
    .map((placement) => `${placement.x},${placement.y},${placement.width},${placement.height}`)
    .join('|');
}

function buildFeaturedMatrixCandidate({ wall, frames, matrix, name, key, forceRank }) {
  const result = placeMatrix(matrix, wall);
  if (!result.ok) return null;

  const metrics = scoreLayoutCandidate(result, wall, frames);
  metrics.score += 9000 - forceRank * 40;

  return {
    ...result,
    name,
    key,
    metrics,
    rowPattern: matrix.map((row) => row.length).join('-'),
    transpose: false,
    familyKey: key,
    signature: signatureForPlacements(result.placements),
    forceInclude: true,
    forceRank,
    featured: true,
  };
}

function buildFeaturedEightFrameGalleryCandidates(frames, wall) {
  const groups = getWideNarrowGroupsForEight(frames);
  if (!groups) return [];

  const { wide, narrow } = groups;
  const variants = [
    {
      key: 'featured:alternating-4-column',
      name: 'Alternating 4-column gallery • like reference photo',
      matrix: [
        [wide[0], narrow[0], wide[1], narrow[1]],
        [narrow[2], wide[2], narrow[3], wide[3]],
      ],
    },
    {
      key: 'featured:alternating-4-column-inverse',
      name: 'Alternating 4-column gallery • inverse',
      matrix: [
        [narrow[0], wide[0], narrow[1], wide[1]],
        [wide[2], narrow[2], wide[3], narrow[3]],
      ],
    },
    {
      key: 'featured:mirrored-checkerboard',
      name: 'Mirrored checkerboard gallery • symmetric columns',
      matrix: [
        [wide[0], narrow[0], narrow[1], wide[1]],
        [narrow[2], wide[2], wide[3], narrow[3]],
      ],
    },
    {
      key: 'featured:outside-anchors',
      name: 'Outside anchor gallery • balanced pairs',
      matrix: [
        [narrow[0], wide[0], wide[1], narrow[1]],
        [wide[2], narrow[2], narrow[3], wide[3]],
      ],
    },
  ];

  return variants
    .map((variant, index) => buildFeaturedMatrixCandidate({
      wall,
      frames,
      matrix: variant.matrix,
      name: variant.name,
      key: variant.key,
      forceRank: index,
    }))
    .filter(Boolean);
}



function placeRows(rowGroups, wall) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;

  if (usableWidth <= 0 || usableHeight <= 0) {
    return { ok: false, reason: 'The inner margin is too large for the selected wall dimensions.' };
  }

  const rowWidths = rowGroups.map((row) => row.reduce((sum, frame) => sum + frame.width, 0));
  const rowHeights = rowGroups.map((row) => row.reduce((max, frame) => Math.max(max, frame.height), 0));

  if (rowWidths.some((width) => width > usableWidth)) {
    return { ok: false, reason: 'At least one row is too wide for the usable wall area.' };
  }

  const totalRowHeight = rowHeights.reduce((sum, value) => sum + value, 0);
  if (totalRowHeight > usableHeight) {
    return { ok: false, reason: 'The rows are too tall for the usable wall area.' };
  }

  const verticalGap = (usableHeight - totalRowHeight) / (rowGroups.length + 1);
  const placements = new Map();
  const rows = [];
  let currentY = wall.innerMargin + verticalGap;
  let minGap = verticalGap;
  const horizontalGaps = [];

  rowGroups.forEach((row, rowIndex) => {
    const rowWidth = rowWidths[rowIndex];
    const rowHeight = rowHeights[rowIndex];
    const horizontalGap = (usableWidth - rowWidth) / (row.length + 1);
    minGap = Math.min(minGap, horizontalGap);
    horizontalGaps.push(horizontalGap);
    rows.push({ items: row, rowWidth, rowHeight, horizontalGap });

    let currentX = wall.innerMargin + horizontalGap;
    row.forEach((frame) => {
      const yOffset = (rowHeight - frame.height) / 2;
      placements.set(frame.id, {
        x: currentX,
        y: currentY + yOffset,
        width: frame.width,
        height: frame.height,
        rowIndex,
      });
      currentX += frame.width + horizontalGap;
    });

    currentY += rowHeight + verticalGap;
  });

  return {
    ok: true,
    usableWidth,
    usableHeight,
    placements,
    rows,
    minGap,
    verticalGap,
    horizontalGaps,
    rowCount: rowGroups.length,
  };
}

function transposeFrame(frame) {
  return {
    ...frame,
    width: frame.height,
    height: frame.width,
  };
}

function transposePlacementResult(result, originalWall, originalFrames) {
  const byId = new Map(originalFrames.map((frame) => [frame.id, frame]));
  const placements = new Map();
  result.placements.forEach((placement, id) => {
    const original = byId.get(id);
    if (!original) return;
    placements.set(id, {
      x: placement.y,
      y: placement.x,
      width: original.width,
      height: original.height,
      rowIndex: placement.rowIndex,
    });
  });

  return {
    ok: true,
    usableWidth: originalWall.width - originalWall.innerMargin * 2,
    usableHeight: originalWall.height - originalWall.innerMargin * 2,
    placements,
    rows: result.rows,
    minGap: result.minGap,
    verticalGap: result.verticalGap,
    horizontalGaps: result.horizontalGaps,
    rowCount: result.rowCount,
  };
}

function getPlacementBounds(placements) {
  const entries = Array.from(placements.values());
  if (!entries.length) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  return entries.reduce(
    (bounds, placement) => ({
      left: Math.min(bounds.left, placement.x),
      top: Math.min(bounds.top, placement.y),
      right: Math.max(bounds.right, placement.x + placement.width),
      bottom: Math.max(bounds.bottom, placement.y + placement.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    }
  );
}

function measureMirrorScore(placements, wall, axis = 'vertical') {
  const items = Array.from(placements.entries()).map(([id, placement]) => ({
    id,
    placement,
    cx: placement.x + placement.width / 2,
    cy: placement.y + placement.height / 2,
  }));
  const centerLine = axis === 'vertical' ? wall.width / 2 : wall.height / 2;
  const used = new Set();
  let score = 0;

  items.sort((a, b) => getFrameArea(b.placement) - getFrameArea(a.placement));

  for (const item of items) {
    if (used.has(item.id)) continue;
    const primary = axis === 'vertical' ? item.cx : item.cy;
    const sizeOnAxis = axis === 'vertical' ? item.placement.width : item.placement.height;

    if (Math.abs(primary - centerLine) <= sizeOnAxis * 0.18) {
      used.add(item.id);
      score += 1;
      continue;
    }

    const mirrored = axis === 'vertical' ? wall.width - item.cx : wall.height - item.cy;
    let best = null;

    for (const other of items) {
      if (other.id === item.id || used.has(other.id)) continue;
      const secondary = axis === 'vertical' ? other.cy : other.cx;
      const itemSecondary = axis === 'vertical' ? item.cy : item.cx;
      const mirroredDistance = Math.abs((axis === 'vertical' ? other.cx : other.cy) - mirrored);
      const secondaryDistance = Math.abs(secondary - itemSecondary);
      const sizeDistance =
        Math.abs(other.placement.width - item.placement.width) + Math.abs(other.placement.height - item.placement.height);
      const cost = mirroredDistance + secondaryDistance * 0.6 + sizeDistance * 0.15;
      if (!best || cost < best.cost) {
        best = { other, cost };
      }
    }

    if (best) {
      const tolerance = axis === 'vertical' ? wall.width : wall.height;
      const normalized = clamp(1 - best.cost / (tolerance * 0.35), 0, 1);
      if (normalized > 0.15) {
        used.add(item.id);
        used.add(best.other.id);
        score += normalized;
      }
    }
  }

  return items.length ? score / items.length : 1;
}

function calculateGapVariance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function scoreLayoutCandidate(layout, wall, frames) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;
  const bounds = getPlacementBounds(layout.placements);
  const groupCenterX = (bounds.left + bounds.right) / 2;
  const groupCenterY = (bounds.top + bounds.bottom) / 2;
  const wallCenterX = wall.width / 2;
  const wallCenterY = wall.height / 2;
  const centerPenalty = Math.abs(groupCenterX - wallCenterX) + Math.abs(groupCenterY - wallCenterY);
  const verticalSymmetry = measureMirrorScore(layout.placements, wall, 'vertical');
  const horizontalSymmetry = measureMirrorScore(layout.placements, wall, 'horizontal');
  const symmetryScore = Math.max(verticalSymmetry, horizontalSymmetry);
  const gapVariance = calculateGapVariance([layout.verticalGap, ...layout.horizontalGaps]);
  const rowCounts = layout.rows.map((row) => row.items.length);
  const rowBalance = calculateGapVariance(rowCounts);
  const usedArea = frames.reduce((sum, frame) => sum + getFrameArea(frame), 0);
  const usableArea = usableWidth * usableHeight;
  const fillRatio = usableArea > 0 ? usedArea / usableArea : 0;

  return {
    score:
      symmetryScore * 1600 +
      layout.minGap * 3.2 -
      gapVariance * 14 -
      centerPenalty * 0.45 -
      rowBalance * 22 -
      Math.abs(fillRatio - 0.42) * 60,
    symmetryScore,
    verticalSymmetry,
    horizontalSymmetry,
    gapVariance,
  };
}

function buildCandidate({
  wall,
  frames,
  orderedFrames,
  counts,
  rowVariant,
  groupVariant,
  assignmentMode = 'slice',
  transpose = false,
  strategyKey,
  orderingName,
}) {
  const workingWall = transpose
    ? { ...wall, width: wall.height, height: wall.width }
    : wall;
  const workingFrames = transpose ? orderedFrames.map(transposeFrame) : orderedFrames;
  const rawGroups = assignRowsByCounts(workingFrames, counts, assignmentMode)
    .map((group) => arrangeSymmetrically(group, rowVariant))
    .filter((group) => group.length > 0);

  const arrangedRows = arrangeRowsVertically(rawGroups, groupVariant);
  let result = placeRows(arrangedRows, workingWall);
  if (!result.ok) return null;

  if (transpose) {
    result = transposePlacementResult(result, wall, orderedFrames);
  }

  const metrics = scoreLayoutCandidate(result, wall, frames);
  const rowPattern = counts.join('-');
  const patternName = getLayoutPatternName(counts, transpose);
  const familyKey = `${rowPattern}:${transpose ? 'columns' : 'rows'}:${assignmentMode}`;
  const signature = signatureForPlacements(result.placements);

  return {
    ...result,
    name: `${patternName} • ${orderingName}`,
    key: `${strategyKey}:${rowPattern}:${assignmentMode}:${rowVariant}:${groupVariant}:${transpose ? 't' : 'r'}`,
    metrics,
    rowPattern,
    transpose,
    familyKey,
    signature,
  };
}

function computeLayoutCandidates(frames, wall) {
  const usableWidth = wall.width - wall.innerMargin * 2;
  const usableHeight = wall.height - wall.innerMargin * 2;

  if (usableWidth <= 0 || usableHeight <= 0) {
    return [
      {
        key: 'invalid-margin',
        name: 'Invalid wall setup',
        placements: new Map(),
        rows: [],
        minGap: 0,
        rowCount: 0,
        usableWidth,
        usableHeight,
        invalidReason: 'The inner margin is too large for the selected wall dimensions.',
      },
    ];
  }

  for (const frame of frames) {
    if (frame.width > usableWidth || frame.height > usableHeight) {
      return [
        {
          key: 'frame-too-large',
          name: 'Frame too large',
          placements: new Map(),
          rows: [],
          minGap: 0,
          rowCount: 0,
          usableWidth,
          usableHeight,
          invalidReason: `“${frame.name}” is too large to fit inside the usable wall area.`,
        },
      ];
    }
  }

  if (!frames.length) {
    return [
      {
        key: 'empty-wall',
        name: 'Balanced gallery',
        placements: new Map(),
        rows: [],
        minGap: Math.min(usableWidth, usableHeight),
        rowCount: 0,
        usableWidth,
        usableHeight,
        metrics: { score: 0, symmetryScore: 1, verticalSymmetry: 1, horizontalSymmetry: 1 },
      },
    ];
  }

  const countPatterns = getRowCountPatterns(frames.length);
  const orderings = getOrderingVariants(frames);
  const assignmentModes = getAssignmentModes();
  const candidates = buildFeaturedEightFrameGalleryCandidates(frames, wall);

  orderings.forEach((ordering, orderingIndex) => {
    countPatterns.forEach((counts, countIndex) => {
      assignmentModes.forEach((assignmentMode) => {
        [0, 1, 2, 3].forEach((rowVariant) => {
          [0, 1, 2, 3].forEach((groupVariant) => {
            const rowCandidate = buildCandidate({
              wall,
              frames,
              orderedFrames: ordering.frames,
              counts,
              rowVariant,
              groupVariant,
              assignmentMode: assignmentMode.key,
              transpose: false,
              orderingName: `${ordering.name}, ${assignmentMode.label}`,
              strategyKey: `${ordering.key}-${orderingIndex}-${countIndex}-rows`,
            });
            if (rowCandidate) candidates.push(rowCandidate);

            const columnCandidate = buildCandidate({
              wall,
              frames,
              orderedFrames: ordering.frames,
              counts,
              rowVariant,
              groupVariant,
              assignmentMode: assignmentMode.key,
              transpose: true,
              orderingName: `${ordering.name}, ${assignmentMode.label}`,
              strategyKey: `${ordering.key}-${orderingIndex}-${countIndex}-cols`,
            });
            if (columnCandidate) candidates.push(columnCandidate);
          });
        });
      });
    });
  });

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.signature)) continue;
    seen.add(candidate.signature);
    unique.push(candidate);
  }

  return selectDiverseCandidates(unique, 24);
}


function recalculateLayouts(preserveSelection = true) {
  const previousKey = preserveSelection ? getActiveLayout()?.key ?? state.selectedLayoutKey : null;
  state.layoutCandidates = computeLayoutCandidates(state.frames, state.wall);
  state.selectedLayoutKey = previousKey;
  updateSelectedLayoutByKey();
}

function applyWallSettings(nextWall) {
  state.wall = {
    ...state.wall,
    ...nextWall,
  };
  recalculateLayouts(true);
  render();
  persistState();

  const activeLayout = getActiveLayout();
  if (activeLayout?.invalidReason) {
    showMessage(activeLayout.invalidReason, 'error');
    return false;
  }

  showMessage('Wall settings applied. Layouts were regenerated for the updated wall.', 'info');
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
  els.photoPreviewMeta.textContent = state.wall.backgroundImage
    ? 'The selected wall area is applied to the preview below.'
    : 'A photo is loaded. Adjust the wall area before placing frames.';
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
    autoSuggested: !selection,
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

async function loadWallImageFile(file, sourceLabel = 'photo') {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const resized = await resizeImageDataUrl(String(reader.result));
      openCropEditor(resized, sourceLabel);
    } catch (error) {
      showMessage('The photo could not be loaded. Try a different image.', 'error');
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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    });

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
  els.cameraVideo.pause();
  els.cameraVideo.srcObject = null;
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
  const dataUrl = els.cameraCanvas.toDataURL('image/jpeg', 0.9);
  stopCamera();

  try {
    const resized = await resizeImageDataUrl(dataUrl);
    openCropEditor(resized, 'camera photo');
  } catch (error) {
    showMessage('The captured photo could not be processed. Try again.', 'error');
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
  els.wallImageCamera.value = '';
  els.wallImageGallery.value = '';
  state.wall.cropSelection = cloneSelection(selection);
  state.wall.backgroundImage = croppedDataUrl;
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
    if (event?.pointerId !== undefined) {
      els.cropStage.releasePointerCapture?.(event.pointerId);
    }
  } catch (error) {
    // no-op
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
  const nextLayouts = computeLayoutCandidates(nextFrames, state.wall);
  const firstLayout = nextLayouts[0];
  if (!nextLayouts.length || firstLayout?.invalidReason) {
    showMessage(`Cannot add ${quantity} frame${quantity === 1 ? '' : 's'} at that size. ${firstLayout?.invalidReason ?? 'No valid layout remains in the usable wall area.'}`, 'error');
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
  showMessage(`Added ${quantity} “${baseName}” frame${quantity === 1 ? '' : 's'} as ${newFrames[0].name}${rangeCopy}. ${state.layoutCandidates.length} unique visual layouts are ready.`, 'info');
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

  const layoutLine = activeLayout?.invalidReason
    ? activeLayout.invalidReason
    : activeLayout
      ? `${activeLayout.name}, ${state.selectedLayoutIndex + 1}/${state.layoutCandidates.length}`
      : 'No layout';

  const photoLine = state.wall.backgroundImage
    ? 'Wall photo aligned and saved locally'
    : state.wall.sourceImage
      ? 'Photo selected, wall area not applied yet'
      : 'No wall photo';

  els.wallSummary.innerHTML = `
    <div><strong>Wall:</strong> ${areaLabel(state.wall.width, state.wall.height, state.wall.unit)}</div>
    <div><strong>Inner margin:</strong> ${formatNumber(state.wall.innerMargin)} ${state.wall.unit}</div>
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
    const axisLabel = activeLayout.metrics.verticalSymmetry >= activeLayout.metrics.horizontalSymmetry ? 'vertical symmetry' : 'horizontal symmetry';
    const patternLabel = activeLayout.rowPattern ? ` • pattern ${activeLayout.rowPattern}` : '';
    const featuredLabel = activeLayout.featured ? ' • reference-style option' : '';
    els.layoutMeta.textContent = `${state.selectedLayoutIndex + 1} of ${state.layoutCandidates.length} layouts${patternLabel}${featuredLabel} • prefers ${axisLabel}`;
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
  return {
    scale,
    width: state.wall.width * scale,
    height: state.wall.height * scale,
  };
}

function renderWall() {
  const { width, height } = fitWallToViewport();
  els.wallCanvas.style.width = `${width}px`;
  els.wallCanvas.style.height = `${height}px`;

  if (state.wall.backgroundImage) {
    els.wallCanvas.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.18)), url(${state.wall.backgroundImage})`;
    els.wallCanvas.style.backgroundSize = '100% 100%, 100% 100%';
    els.wallCanvas.style.backgroundPosition = 'center center, center center';
    els.wallCanvas.style.backgroundRepeat = 'no-repeat, no-repeat';
  } else {
    els.wallCanvas.style.backgroundImage = 'linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.28)), linear-gradient(180deg, #d8d1c9, #c4b8ab)';
    els.wallCanvas.style.backgroundSize = '';
    els.wallCanvas.style.backgroundPosition = '';
    els.wallCanvas.style.backgroundRepeat = '';
  }

  const innerRenderWidth = els.wallCanvas.clientWidth;
  const innerRenderHeight = els.wallCanvas.clientHeight;
  const scaleX = innerRenderWidth / state.wall.width;
  const scaleY = innerRenderHeight / state.wall.height;

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
    const frameWidthPx = placement.width * scaleX;
    const frameHeightPx = placement.height * scaleY;
    if (frameWidthPx < 72 || frameHeightPx < 72) {
      frameEl.classList.add('frame-compact');
    }
    frameEl.style.left = `${placement.x * scaleX}px`;
    frameEl.style.top = `${placement.y * scaleY}px`;
    frameEl.style.width = `${frameWidthPx}px`;
    frameEl.style.height = `${frameHeightPx}px`;

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
  if (state.pendingCrop) {
    renderCropSelection();
  }
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
  if (!els.cameraModal.classList.contains('hidden')) {
    stopCamera();
  }
}

function updateCropStageRatio() {
  if (!els.cropImage.naturalWidth || !els.cropImage.naturalHeight) return;
  els.cropStage.style.setProperty('--crop-ratio', `${els.cropImage.naturalWidth} / ${els.cropImage.naturalHeight}`);
  if (state.pendingCrop?.autoSuggested) {
    state.pendingCrop.selection = getSuggestedCropSelection(els.cropImage.naturalWidth, els.cropImage.naturalHeight);
    state.pendingCrop.autoSuggested = false;
  }
  renderCropSelection();
}

function syncFormValuesFromState() {
  els.wallWidth.value = formatNumber(state.wall.width);
  els.wallHeight.value = formatNumber(state.wall.height);
  els.innerMargin.value = formatNumber(state.wall.innerMargin);
  els.frameName.value = state.draftFrame.name || 'Picture';
  els.frameWidth.value = formatNumber(state.draftFrame.width || 300);
  els.frameHeight.value = formatNumber(state.draftFrame.height || 400);
  els.frameQuantity.value = String(Math.max(1, Math.min(50, Math.floor(state.draftFrame.quantity || 1))));
}

function init() {
  restoreState();
  syncFormValuesFromState();
  recalculateLayouts(true);
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
  [els.frameName, els.frameWidth, els.frameHeight, els.frameQuantity].forEach((input) => {
    input.addEventListener('change', persistDraftFrame);
    input.addEventListener('blur', persistDraftFrame);
  });
  els.clearFrames.addEventListener('click', clearFrames);
  els.prevLayout.addEventListener('click', () => cycleLayout(-1));
  els.nextLayout.addEventListener('click', () => cycleLayout(1));
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
