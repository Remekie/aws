import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // setup image columns and card structure
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column — pure image col
          picWrapper.classList.add('columns-img-col');
        } else {
          // mixed column with image + text — split into card image / card body
          picWrapper.classList.add('columns-card-image');
          [...picWrapper.children].forEach((child) => {
            if (!child.querySelector('picture') && child !== pic) {
              child.classList.add('columns-card-body');
            }
          });
        }
      }

      // Wrap remaining non-image divs as card body when there is an image sibling
      const hasImageCol = [...row.children].some((c) => c.classList.contains('columns-img-col') || c.classList.contains('columns-card-image'));
      if (hasImageCol && !col.classList.contains('columns-img-col') && !col.classList.contains('columns-card-image')) {
        col.classList.add('columns-card-body');
      }
    });
  });

  // When each row is a card (image col + body col) — convert row to a card wrapper
  [...block.children].forEach((row) => {
    const imgCol = row.querySelector('.columns-img-col');
    const bodyCol = row.querySelector('.columns-card-body');
    if (imgCol && bodyCol) {
      row.classList.add('columns-card');
    }
  });

  block.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    img.closest('picture').replaceWith(optimizedPic);
  });
}
