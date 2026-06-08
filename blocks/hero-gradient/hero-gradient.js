/** @param {Element} block The hero-gradient block element */
export default function decorate(block) {
  const heroImg = block.querySelector('img');
  if (heroImg) {
    heroImg.loading = 'eager';
    heroImg.fetchPriority = 'high';
  }

  const pictures = block.querySelectorAll('picture');

  if (pictures.length >= 2) {
    const lightDiv = pictures[0].closest('.hero-gradient > div');
    const darkDiv = pictures[1].closest('.hero-gradient > div');
    if (lightDiv) lightDiv.classList.add('hero-gradient-img-light');
    if (darkDiv) darkDiv.classList.add('hero-gradient-img-dark');

    const isDark = document.body.classList.contains('dark-scheme');
    if (isDark && darkDiv && lightDiv) {
      lightDiv.parentElement.insertBefore(darkDiv, lightDiv);
    }
  } else if (pictures.length < 1) {
    block.classList.add('no-image');
  }

  const h1 = block.querySelector('h1');
  if (!h1) return;

  const contentDiv = h1.closest('div');
  if (!contentDiv) return;

  const textDiv = contentDiv.parentElement;
  if (textDiv) textDiv.classList.add('hero-gradient-text');
}
