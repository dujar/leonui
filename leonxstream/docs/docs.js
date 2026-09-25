/* docs.js — docs shell: sidebar from manifest, live examples loaded from their
 * source files (each example page is the single source of truth: shown as code
 * AND rendered live in an iframe). */
(function () {
  'use strict';

  const MANIFEST = [
    ['/docs/', 'Welcome'],
    ['/docs/hello-world.html', 'Hello world'],
    ['/docs/state-and-binds.html', 'State & binds'],
    ['/docs/lists.html', 'Lists'],
    ['/docs/forms.html', 'Forms'],
    ['/docs/server-data.html', 'Server data'],
    ['/docs/overlays.html', 'Overlays & toasts'],
    ['/docs/theming.html', 'Theming'],
    ['/docs/verbs-reference.html', 'Verb reference'],
  ];

  const nav = document.getElementById('docs-nav');
  if (nav) {
    nav.innerHTML = '<ul>' + MANIFEST.map(([href, label]) =>
      `<li><a href="${href}">${label}</a></li>`).join('') + '</ul>';
    for (const a of nav.querySelectorAll('a'))
      if (a.getAttribute('href') === location.pathname) a.classList.add('current');
  }

  for (const slot of document.querySelectorAll('[data-example]')) {
    const src = slot.getAttribute('data-example');
    const fig = document.createElement('figure');
    fig.className = 'doc-example';
    const caption = document.createElement('figcaption');
    caption.textContent = src + ' — source / live result';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.appendChild(code);
    const frame = document.createElement('iframe');
    frame.setAttribute('loading', 'lazy');
    frame.src = src;
    fig.append(caption, pre, frame);
    slot.replaceWith(fig);
    fetch(src).then(r => r.text()).then(text => { code.textContent = text.trim(); });
  }
})();
