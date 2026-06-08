import { moveInstrumentation } from './ue-utils.js';

const setupObservers = () => {
  const mutatingBlocks = document.querySelectorAll('div.cards, div.cards-editorial, div.cards-industry, div.carousel-deluxe, div.journey-map');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.target.tagName === 'DIV') {
        const addedElements = mutation.addedNodes;
        const removedElements = mutation.removedNodes;

        // detect the mutation type of the block or picture (for cards)
        const type = mutation.target.classList.contains('cards-card-image')
          ? 'cards-image'
          : mutation.target.classList.contains('cards-editorial-card-image')
            ? 'cards-editorial-image'
            : mutation.target.classList.contains('cards-industry-card-image')
              ? 'cards-industry-image'
              : mutation.target.attributes['data-aue-component']?.value;

        // shared helper: move instrumentation from removed divs to matching li children in a new ul
        const moveDivsToUl = (added, removed) => {
          if (added.length === 1 && added[0].tagName === 'UL') {
            const ulEl = added[0];
            [...removed].filter((n) => n.tagName === 'DIV').forEach((div, i) => {
              if (i < ulEl.children.length) moveInstrumentation(div, ulEl.children[i]);
            });
          }
        };

        // shared helper: move instrumentation when a picture is replaced inside a card-image div
        const movePictureInstrumentation = (added, removed) => {
          const addedPic = [...added].filter((n) => n.tagName === 'PICTURE');
          const removedPic = [...removed].filter((n) => n.tagName === 'PICTURE');
          if (addedPic.length === 1 && removedPic.length === 1) {
            const oldImg = removedPic[0].querySelector('img');
            const newImg = addedPic[0].querySelector('img');
            if (oldImg && newImg) moveInstrumentation(oldImg, newImg);
          }
        };

        switch (type) {
          case 'cards':
            moveDivsToUl(addedElements, mutation.removedNodes);
            break;
          case 'cards-image':
            if (mutation.target.classList.contains('cards-card-image')) {
              movePictureInstrumentation(addedElements, mutation.removedNodes);
            }
            break;
          case 'cards-editorial':
          case 'cards-industry':
            moveDivsToUl(addedElements, mutation.removedNodes);
            break;
          case 'cards-editorial-image':
          case 'cards-industry-image':
            movePictureInstrumentation(addedElements, mutation.removedNodes);
            break;
          case 'carousel-deluxe': {
            // rows become li.carousel-deluxe-slide elements inside a container > ul
            const addedContainer = [...addedElements].find(
              (n) => n.tagName === 'DIV' && n.classList.contains('carousel-deluxe-slides-container'),
            );
            if (addedContainer) {
              const ulEl = addedContainer.querySelector('ul.carousel-deluxe-slides');
              if (ulEl) {
                const realSlides = [...ulEl.querySelectorAll('.carousel-deluxe-slide:not([data-is-clone])')];
                [...mutation.removedNodes].filter((n) => n.tagName === 'DIV').forEach((div, i) => {
                  if (i < realSlides.length) moveInstrumentation(div, realSlides[i]);
                });
              }
            }
            break;
          }
          case 'journey-map':
            // handle row div → article replacements (custom block)
            if (addedElements.length === 1 && addedElements[0].tagName === 'ARTICLE') {
              if (removedElements.length === 1) {
                moveInstrumentation(removedElements[0], addedElements[0]);
              }
            }
            break;
          default:
            break;
        }
      }
    });
  });

  mutatingBlocks.forEach((block) => {
    observer.observe(block, { childList: true, subtree: true });
  });
};

const setupUEEventHandlers = () => {
  // For each picture or img element change, update the srcsets of the picture element sources
  document.body.addEventListener('aue:content-patch', ({ detail: { patch, request } }) => {
    let element = document.querySelector(`[data-aue-resource="${request.target.resource}"]`);
    if (element && element.getAttribute('data-aue-prop') !== patch.name) element = element.querySelector(`[data-aue-prop='${patch.name}']`);
    if (element?.getAttribute('data-aue-type') !== 'media') return;

    const picture = element.tagName === 'IMG' ? element.closest('picture') : element;
    picture?.querySelectorAll('source').forEach((source) => source.remove());
    picture?.querySelector('img')?.removeAttribute('srcset');
  });

  document.body.addEventListener('aue:ui-select', (event) => {
    const { detail } = event;
    const resource = detail?.resource;

    if (resource) {
      const element = document.querySelector(`[data-aue-resource="${resource}"]`);
      if (!element) {
        return;
      }
      const blockEl = element.parentElement?.closest('.block[data-aue-resource]') || element?.closest('.block[data-aue-resource]');
      if (blockEl) {
        const block = blockEl.getAttribute('data-aue-component');

        switch (block) {
          case 'journey-map': {
            // Click the toggle for the selected step
            const toggle = element.querySelector('.journey-map-step-toggle');
            if (toggle && !toggle.disabled) toggle.click();
            break;
          }
          case 'tabs':
            if (element === blockEl) {
              return;
            }
            blockEl.querySelectorAll('[role=tabpanel]').forEach((panel) => {
              panel.setAttribute('aria-hidden', true);
            });
            element.setAttribute('aria-hidden', false);
            blockEl.querySelector('.tabs-list').querySelectorAll('button').forEach((btn) => {
              btn.setAttribute('aria-selected', false);
            });
            blockEl.querySelector(`[aria-controls=${element?.id}]`).setAttribute('aria-selected', true);
            break;
          default:
            break;
        }
      }
    }
  });
};

export default () => {
  setupObservers();
  setupUEEventHandlers();
};