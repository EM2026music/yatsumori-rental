function toggleMenu() {
  const nav = document.getElementById("global-nav");
  if (!nav) return;
  nav.classList.toggle("is-open");
}

document.addEventListener("click", (e) => {
  const nav = document.getElementById("global-nav");
  const btn = document.getElementById("menu-button");
  if (!nav || !btn) return;
  if (nav.classList.contains("is-open") && !nav.contains(e.target) && !btn.contains(e.target)) {
    nav.classList.remove("is-open");
  }
});
