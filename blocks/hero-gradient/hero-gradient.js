/** @param {Element} block The hero-gradient block element */
export default function decorate(block) {
  const img = block.querySelector('img');
  if (img) {
    img.loading = 'eager';
    img.fetchPriority = 'high';
  }
}
