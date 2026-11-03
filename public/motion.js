// Keep content visible when motion is disabled or observers are unavailable.
export function setupMotion(root, reduced) {
  const groups = [
    ['.portraits', 'figure', ['left', 'right']],
    ['.families', ':scope > div', ['left', 'right']],
    ['.story-text', 'p', ['up']],
    ['.album-section', 'h2, .album-photo, .more-photos', ['zoom']],
    ['.invitation-names', ':scope > span', ['up']],
  ];
  for (const [selector, children, directions] of groups) {
    const group = root.querySelector(selector);
    if (!group) continue;
    group.classList.remove('reveal');
    group.querySelectorAll(children).forEach((el, i) => {
      el.classList.add('reveal');
      el.dataset.reveal = directions[i % directions.length];
      el.style.setProperty('--reveal-delay', `${i % 2 * 110}ms`);
    });
  }
  root.querySelectorAll('.event-card').forEach((el, i) => { el.dataset.reveal = i % 2 ? 'right' : 'left'; });
  root.querySelector('.calendar-card')?.setAttribute('data-reveal', 'zoom');
  const elements = [...root.querySelectorAll('.reveal')];
  const scene = root.querySelector('.envelope-scene');
  const supported = 'IntersectionObserver' in window;
  const observer = supported ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' }) : null;
  const sceneObserver = supported ? new IntersectionObserver(entries => {
    scene.classList.toggle('motion-active', entries[0].isIntersecting);
  }) : null;
  if (scene) sceneObserver?.observe(scene);
  const observeNew = () => {
    for (const el of elements) {
      if (el.hidden || el.classList.contains('visible')) continue;
      if (reduced.matches || !observer) el.classList.add('visible');
      else { el.classList.add('will-reveal'); observer.observe(el); }
    }
  };
  const update = () => {
    root.classList.toggle('motion-enabled', !reduced.matches && supported);
    if (reduced.matches) {
      observer?.disconnect();
      elements.forEach(el => el.classList.add('visible'));
    }
    observeNew();
  };
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', () => root.classList.toggle('motion-paused', document.hidden));
  // Keyboard navigation must never land on an invisible control.
  root.addEventListener('focusin', event => {
    for (let el = event.target; el && el !== root; el = el.parentElement) {
      if (el.classList.contains('reveal')) { el.classList.add('visible'); observer?.unobserve(el); }
    }
  });
  update();
  return observeNew;
}
