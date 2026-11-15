const motionCurve = "cubic-bezier(0.22, 1, 0.36, 1)";

export function initializeLanding(document, environment) {
  const reducedMotion =
    environment.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
    true;
  initializeSketch(document, reducedMotion);
  initializeNavigation(document);
  initializeReveals(document, environment, reducedMotion);
  initializeTagline(document, environment, reducedMotion);
}

function initializeSketch(document, reducedMotion) {
  const plan = document.querySelector("#demo-plan");
  const caption = document.querySelector("#stage-caption");
  if (!plan || !caption) return;
  const buttons = document.querySelectorAll("[data-stage-button]");
  const captions = [
    "Illustrative sketch: start with the outline of the rooms you know. Open the editor to draw your own.",
    "Illustrative sketch: add doors, windows and familiar fixtures. Open the editor to draw your own.",
    "Illustrative sketch: room names bring the whole place together. Open the editor to draw your own.",
  ];
  const showStage = (stage) => {
    plan.dataset.stage = String(stage);
    buttons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.stageButton) === stage),
      ),
    );
    caption.textContent = captions[stage];
  };
  buttons.forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", () =>
      showStage(Number(button.dataset.stageButton)),
    );
  });
  const replay = document.querySelector("#replay-sketch");
  if (!replay) return;
  replay.disabled = false;
  replay.addEventListener("click", () => {
    showStage(2);
    if (reducedMotion) {
      plan.animate?.([{ opacity: 0.7 }, { opacity: 1 }], {
        duration: 300,
        easing: motionCurve,
      });
      return;
    }
    plan.getAnimations({ subtree: true }).forEach((animation) => {
      animation.cancel();
      animation.play();
    });
  });
}

function initializeNavigation(document) {
  const menu = document.querySelector("#mobile-menu");
  const toggle = document.querySelector("#menu-toggle");
  if (!menu || !toggle || typeof menu.showModal !== "function") return;
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    menu.showModal();
    toggle.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("menu-open");
  });
  menu.addEventListener("close", () => {
    toggle.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("menu-open");
    toggle.focus();
  });
  menu
    .querySelectorAll("a, [data-menu-close]")
    .forEach((link) => link.addEventListener("click", () => menu.close()));
}

function initializeReveals(document, environment, reducedMotion) {
  if (reducedMotion || typeof environment.IntersectionObserver !== "function")
    return;
  const observer = new environment.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("reveal-pending");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08 },
  );
  document.querySelectorAll("[data-reveal]").forEach((section) => {
    section.classList.add("reveal-pending");
    observer.observe(section);
  });
}

function initializeTagline(document, environment, reducedMotion) {
  const tagline = document.querySelector("[data-tagline]");
  if (
    !tagline ||
    reducedMotion ||
    typeof environment.requestAnimationFrame !== "function"
  )
    return;
  const words = [...tagline.querySelectorAll("[data-tagline-word]")];
  let scheduled = false;
  let revealed = 0;
  const update = () => {
    scheduled = false;
    const bounds = tagline.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(
        1,
        (environment.innerHeight * 0.75 - bounds.top) /
          (bounds.height + environment.innerHeight * 0.35),
      ),
    );
    const count = Math.floor(progress * words.length);
    for (; revealed < count; revealed++)
      words[revealed].classList.add("word-active");
    if (revealed === words.length) {
      environment.removeEventListener("scroll", schedule);
      environment.removeEventListener("resize", schedule);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    environment.requestAnimationFrame(update);
  };
  tagline.classList.add("is-word-reveal");
  environment.addEventListener("scroll", schedule, { passive: true });
  environment.addEventListener("resize", schedule);
  schedule();
}
