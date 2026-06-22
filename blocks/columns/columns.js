import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const rows = [...block.children];
  const cards = [];

  if (rows.length > 1) {
    // Case 1: Multi-row table where cells are aligned vertically to form cards
    const numCols = rows[0].children.length;
    for (let j = 0; j < numCols; j++) {
      const card = document.createElement('div');
      card.classList.add('columns-card');

      const imgCol = document.createElement('div');
      imgCol.classList.add('columns-img-col');

      const bodyCol = document.createElement('div');
      bodyCol.classList.add('columns-card-body');

      rows.forEach((row) => {
        const cell = row.children[j];
        if (cell) {
          const pic = cell.querySelector('picture');
          if (pic) {
            imgCol.appendChild(pic);
          } else {
            // Append all children of the cell to the bodyCol
            while (cell.firstChild) {
              bodyCol.appendChild(cell.firstChild);
            }
          }
        }
      });

      // Only append imgCol if it has children (i.e. contains a picture)
      if (imgCol.children.length > 0) {
        card.appendChild(imgCol);
      } else {
        bodyCol.style.borderRadius = '16px';
      }
      card.appendChild(bodyCol);
      cards.push(card);
    }
  } else if (rows.length === 1) {
    // Case 2: Single-row table where each column/cell is already a self-contained card
    const row = rows[0];
    [...row.children].forEach((col) => {
      const card = document.createElement('div');
      card.classList.add('columns-card');

      const imgCol = document.createElement('div');
      imgCol.classList.add('columns-img-col');

      const bodyCol = document.createElement('div');
      bodyCol.classList.add('columns-card-body');

      const pic = col.querySelector('picture');
      if (pic) {
        imgCol.appendChild(pic);
        card.appendChild(imgCol);
      } else {
        bodyCol.style.borderRadius = '16px';
      }

      // Move everything else in the column cell to the bodyCol
      while (col.firstChild) {
        bodyCol.appendChild(col.firstChild);
      }

      card.appendChild(bodyCol);
      cards.push(card);
    });
  }

  // If we created cards, clear block and append them directly to block
  if (cards.length > 0) {
    block.innerHTML = '';
    cards.forEach((card) => block.appendChild(card));
    // Set a class indicating the number of columns
    block.classList.add(`columns-${cards.length}-cols`);
  }

  // Optimize images
  block.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    img.closest('picture').replaceWith(optimizedPic);
  });
}
