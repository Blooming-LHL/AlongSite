const DEFAULT_ROW_HEIGHT = 8;
const DEFAULT_ROW_GAP = 24;
const MOBILE_BREAKPOINT = 700;

/** Return the number of 8px grid rows needed to fit a card's natural height. */
export function calculateMasonrySpan(height, rowGap = DEFAULT_ROW_GAP, rowHeight = DEFAULT_ROW_HEIGHT) {
  const cardHeight = Number(height);
  const gap = Number(rowGap);
  const row = Number(rowHeight);
  if (!Number.isFinite(cardHeight) || cardHeight <= 0) return 1;
  if (!Number.isFinite(gap) || gap < 0 || !Number.isFinite(row) || row <= 0) return 1;
  return Math.max(1, Math.ceil((cardHeight + gap) / (row + gap)));
}

function pixels(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getComputed(element, win) {
  return win?.getComputedStyle?.(element) || {};
}

function isSingleColumn(grid, win) {
  const style = getComputed(grid, win);
  const columns = String(style.gridTemplateColumns || '').trim();
  if (columns) {
    // Computed styles normally resolve repeat() to one track per column.
    const tracks = columns.match(/(?:\([^)]*\)|[^\s])+/g) || [];
    if (tracks.length === 1) return true;
    if (tracks.length > 1) return false;
  }
  return Boolean(win?.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT}px)`)?.matches);
}

function directArticleCards(grid) {
  return Array.from(grid.children || []).filter((card) => (
    card.classList?.contains('card') && card.classList.contains('article-card')
  ));
}

function clearSpans(cards) {
  cards.forEach((card) => { card.style.gridRowEnd = ''; });
}

function resetGrid(grid, cards) {
  grid.classList?.remove('is-masonry');
  clearSpans(cards);
}

function updateGrid(grid, win) {
  const cards = directArticleCards(grid);
  if (!cards.length || isSingleColumn(grid, win)) {
    resetGrid(grid, cards);
    return;
  }

  grid.classList?.add('is-masonry');
  const style = getComputed(grid, win);
  const rowHeight = pixels(style.gridAutoRows, DEFAULT_ROW_HEIGHT);
  const rowGap = pixels(style.rowGap || style.gap, DEFAULT_ROW_GAP);

  // Homepage cards use align-items:start, so a row span does not stretch the
  // card. The rect is therefore the natural card height on every pass.
  const spans = cards.map((card) => calculateMasonrySpan(card.getBoundingClientRect().height, rowGap, rowHeight));
  cards.forEach((card, index) => {
    const next = `span ${spans[index]}`;
    if (card.style.gridRowEnd !== next) card.style.gridRowEnd = next;
  });
}

export function startHomeMasonry(root = globalThis.document) {
  if (!root?.querySelectorAll) return () => {};
  const win = root.defaultView || globalThis.window;
  const grids = Array.from(root.querySelectorAll('.article-grid'));
  let frame = null;
  let stopped = false;
  const listeners = [];

  const update = () => {
    frame = null;
    if (stopped) return;
    grids.forEach((grid) => updateGrid(grid, win));
  };
  const schedule = () => {
    if (stopped || frame !== null) return;
    const raf = win?.requestAnimationFrame || globalThis.requestAnimationFrame;
    if (raf) frame = win?.requestAnimationFrame ? win.requestAnimationFrame(update) : raf(update);
    else { update(); }
  };

  const observer = win?.ResizeObserver || globalThis.ResizeObserver;
  const resizeObserver = observer ? new observer(() => schedule()) : null;
  grids.forEach((grid) => {
    resizeObserver?.observe(grid);
    directArticleCards(grid).forEach((card) => {
      resizeObserver?.observe(card);
      card.querySelectorAll?.('img').forEach((image) => {
        ['load', 'error'].forEach((event) => {
          const onImageEvent = () => schedule();
          image.addEventListener?.(event, onImageEvent);
          listeners.push(() => image.removeEventListener?.(event, onImageEvent));
        });
      });
    });
  });
  if (win?.addEventListener) {
    win.addEventListener('resize', schedule);
    listeners.push(() => win.removeEventListener?.('resize', schedule));
  }
  schedule();

  return () => {
    stopped = true;
    if (frame !== null) {
      if (win?.cancelAnimationFrame) win.cancelAnimationFrame(frame);
      else globalThis.cancelAnimationFrame?.(frame);
      frame = null;
    }
    resizeObserver?.disconnect();
    listeners.forEach((remove) => remove());
  };
}

if (globalThis.document) startHomeMasonry();
