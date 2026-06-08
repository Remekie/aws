import { readBlockConfig, toClassName } from '../../scripts/aem.js';

export default function decorate(block) {
  const section = block.closest('.section');
  if (section) {
    const meta = readBlockConfig(block);
    Object.keys(meta).forEach((key) => {
      if (key === 'style') {
        meta.style.split(',').map((s) => toClassName(s.trim())).filter(Boolean)
          .forEach((s) => section.classList.add(s));
      } else {
        section.dataset[key] = meta[key];
      }
    });
  }
  block.parentElement.remove();
}
