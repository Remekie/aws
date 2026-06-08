const placeholders = { carousel: 'Carousel', carouselSlideControls: 'Carousel Slide Controls', previousSlide: 'Previous Slide', nextSlide: 'Next Slide', of: 'of' };

function updateActiveSlide(slide) {
  const block = slide.closest('.carousel-deluxe');
  const slideIndex = parseInt(slide.dataset.slideIndex, 10);
  block.dataset.activeSlide = slideIndex;

  const slides = block.querySelectorAll('.carousel-deluxe-slide:not([data-is-clone])');

  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== slideIndex);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (idx !== slideIndex) {
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('tabindex');
      }
    });
  });

  const indicators = block.querySelectorAll('.carousel-deluxe-slide-indicator');
  indicators.forEach((indicator, idx) => {
    if (idx !== slideIndex) {
      indicator.querySelector('button').removeAttribute('disabled');
    } else {
      indicator.querySelector('button').setAttribute('disabled', 'true');
    }
  });
}

export function showSlide(block, slideIndex = 0, behavior = 'smooth') {
  const slidesEl = block.querySelector('.carousel-deluxe-slides');
  const realSlides = [...slidesEl.querySelectorAll('.carousel-deluxe-slide:not([data-is-clone])')];
  const N = realSlides.length;
  const idx = ((slideIndex % N) + N) % N;
  const target = realSlides[idx];
  target.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
  const centeredLeft = target.offsetLeft + target.offsetWidth / 2 - slidesEl.offsetWidth / 2;
  slidesEl.scrollTo({ top: 0, left: Math.max(0, centeredLeft), behavior });
}

function updateHaloPosition(block) {
  const slidesEl = block.querySelector('.carousel-deluxe-slides');
  const slides = [...block.querySelectorAll('.carousel-deluxe-slide')];
  const cw = slidesEl.offsetWidth;
  const { scrollLeft } = slidesEl;

  // Find the slide closest to the viewport center
  let best = null;
  let bestDist = Infinity;
  slides.forEach((s) => {
    const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - scrollLeft - cw / 2);
    if (d < bestDist) { bestDist = d; best = s; }
  });
  if (!best) return;

  const W = best.offsetWidth;
  const H = best.offsetHeight;

  // Derive the slide's current scale from its cover(inline) animation progress.
  // Keyframes: 0% translateX(-12.5%) scale(0.75), 50% none, 100% translateX(+12.5%) scale(0.75)
  const coverStart = best.offsetLeft - cw;
  const coverEnd = best.offsetLeft + W;
  const p = coverEnd > coverStart
    ? Math.max(0, Math.min(1, (scrollLeft - coverStart) / (coverEnd - coverStart)))
    : 0.5;
  const t = p <= 0.5 ? p * 2 : (1 - p) * 2; // 0→1→0 as p goes 0→0.5→1
  const scale = 0.75 + 0.25 * t;

  // Visual horizontal bounds (translateX compensation anchors the peek-visible edge)
  const layoutLeft = best.offsetLeft - scrollLeft;
  const vLeft = p <= 0.5 ? layoutLeft : layoutLeft + W * (1 - scale);
  const vRight = p <= 0.5 ? layoutLeft + W * scale : layoutLeft + W;

  // Visual vertical bounds (centered scaling, no translateY)
  const vShrink = (1 - scale) / 2 * H;

  block.style.setProperty('--halo-left', `${Math.max(0, vLeft)}px`);
  block.style.setProperty('--halo-right', `${Math.max(0, cw - vRight)}px`);
  block.style.setProperty('--halo-top', `${Math.max(0, vShrink)}px`);
  block.style.setProperty('--halo-bottom', `${Math.max(0, vShrink)}px`);
}

// When scroll settles on a clone, silently teleport to the real counterpart.
function handleScrollEnd(block) {
  const slidesEl = block.querySelector('.carousel-deluxe-slides');
  const allSlides = [...slidesEl.querySelectorAll('.carousel-deluxe-slide')];
  const cw = slidesEl.offsetWidth;
  const { scrollLeft } = slidesEl;

  let best = null;
  let bestDist = Infinity;
  allSlides.forEach((s) => {
    const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - scrollLeft - cw / 2);
    if (d < bestDist) { bestDist = d; best = s; }
  });

  if (!best || !best.dataset.isClone) return;

  const realIdx = parseInt(best.dataset.cloneOf, 10);
  const realSlide = allSlides.find(
    (s) => !s.dataset.isClone && parseInt(s.dataset.slideIndex, 10) === realIdx,
  );
  if (!realSlide) return;

  const centeredLeft = realSlide.offsetLeft + realSlide.offsetWidth / 2 - cw / 2;
  slidesEl.scrollTo({ left: Math.max(0, centeredLeft), behavior: 'instant' });
  updateHaloPosition(block);
}

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-deluxe-slide-indicators');
  if (!slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const slidesEl = block.querySelector('.carousel-deluxe-slides');
  let scrollEndTimer;
  slidesEl.addEventListener('scroll', () => {
    updateHaloPosition(block);
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => handleScrollEnd(block), 200);
  }, { passive: true });
  // scrollend fires natively where supported; the setTimeout above is the fallback
  slidesEl.addEventListener('scrollend', () => {
    clearTimeout(scrollEndTimer);
    handleScrollEnd(block);
  }, { passive: true });

  requestAnimationFrame(() => updateHaloPosition(block));

  // Only count real slides as "active" — clones never reach 50% visibility (peek = ~25%)
  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !entry.target.dataset.isClone) {
        updateActiveSlide(entry.target);
      }
    });
  }, { threshold: 0.5 });
  block.querySelectorAll('.carousel-deluxe-slide').forEach((slide) => {
    slideObserver.observe(slide);
  });
}

function createSlide(row, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-deluxe-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-deluxe-slide');

  row.querySelectorAll(':scope > div').forEach((column, colIdx) => {
    column.classList.add(`carousel-deluxe-slide-${colIdx === 0 ? 'image' : 'content'}`);
    slide.append(column);
  });

  const labeledBy = slide.querySelector('h1, h2, h3, h4, h5, h6');
  if (labeledBy) {
    slide.setAttribute('aria-labelledby', labeledBy.getAttribute('id'));
  }

  return slide;
}

let carouselId = 0;
export default async function decorate(block) {
  carouselId += 1;
  block.setAttribute('id', `carousel-deluxe-${carouselId}`);
  const rows = block.querySelectorAll(':scope > div');
  const isSingleSlide = rows.length < 2;


  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', placeholders.carousel || 'Carousel');

  const container = document.createElement('div');
  container.classList.add('carousel-deluxe-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-deluxe-slides');
  block.prepend(slidesWrapper);

  let slideIndicators;
  if (!isSingleSlide) {
    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', placeholders.carouselSlideControls || 'Carousel Slide Controls');
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-deluxe-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    block.append(slideIndicatorsNav);

    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-deluxe-navigation-buttons');
    slideNavButtons.innerHTML = `
      <button type="button" class= "slide-prev" aria-label="${placeholders.previousSlide || 'Previous Slide'}"></button>
      <button type="button" class="slide-next" aria-label="${placeholders.nextSlide || 'Next Slide'}"></button>
    `;

    container.append(slideNavButtons);
  }

  rows.forEach((row, idx) => {
    const slide = createSlide(row, idx, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-deluxe-slide-indicator');
      indicator.dataset.targetSlide = idx;
      indicator.innerHTML = `<button type="button" aria-label="${placeholders.showSlide || 'Show Slide'} ${idx + 1} ${placeholders.of || 'of'} ${rows.length}"></button>`;
      slideIndicators.append(indicator);
    }
    row.remove();
  });

  // Infinite loop: clone last→prepend, clone first→append so there is always a peek on both sides
  if (!isSingleSlide) {
    const realSlides = [...slidesWrapper.querySelectorAll('.carousel-deluxe-slide')];
    const N = realSlides.length;
    const cloneFirst = realSlides[0].cloneNode(true);
    const cloneLast = realSlides[N - 1].cloneNode(true);
    cloneFirst.removeAttribute('id');
    cloneLast.removeAttribute('id');
    cloneFirst.dataset.isClone = 'true';
    cloneFirst.dataset.cloneOf = '0';
    cloneLast.dataset.isClone = 'true';
    cloneLast.dataset.cloneOf = String(N - 1);
    cloneFirst.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    cloneLast.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    slidesWrapper.append(cloneFirst);
    slidesWrapper.prepend(cloneLast);
  }

  container.append(slidesWrapper);
  block.prepend(container);

  if (!isSingleSlide) {
    block.dataset.activeSlide = '0';
    bindEvents(block);
    // Scroll to the first real slide (past the prepended clone) without animation
    requestAnimationFrame(() => {
      showSlide(block, 0, 'instant');
      updateHaloPosition(block);
    });
  }
}
