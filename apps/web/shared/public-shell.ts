import './public-shell.css';

const menu = document.querySelector<HTMLElement>('#home-navigation')!;
const menuToggle = document.querySelector<HTMLButtonElement>('.home-menu-toggle')!;
const footerYear = document.querySelector<HTMLElement>('#home-footer-year')!;
footerYear.textContent = String(new Date().getFullYear());

function setMenu(open: boolean) {
  menu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

menuToggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
document.addEventListener('click', event => {
  const target = event.target as Element;
  if (target.closest('.home-header a') || !target.closest('.home-header')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.classList.contains('is-open')) {
    setMenu(false);
    menuToggle.focus();
  }
});
