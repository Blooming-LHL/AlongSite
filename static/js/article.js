(() => {
  'use strict';

  const announce = (button, message) => {
    button.textContent = message;
    const status = button.parentElement.querySelector('.code-copy-status');
    if (status) status.textContent = message;
    window.setTimeout(() => {
      button.textContent = '复制';
      button.setAttribute('aria-label', '复制代码');
      if (status) status.textContent = '';
    }, 1600);
  };

  const fallbackCopy = (text) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
    area.remove();
    return copied;
  };

  document.querySelectorAll('.code-block').forEach((block) => {
    const button = block.querySelector('.code-copy');
    const code = block.querySelector('pre');
    if (!button || !code) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
      const text = block.dataset.code ?? code.textContent ?? '';
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { copied = false; }
      }
      if (!copied) copied = fallbackCopy(text);
      announce(button, copied ? '已复制' : '复制失败');
      button.setAttribute('aria-label', copied ? '已复制代码' : '复制代码失败');
      button.focus({ preventScroll: true });
    });
  });

  const decodeHash = (hash) => {
    try { return decodeURIComponent(hash); } catch (_) { return hash; }
  };
  const tocLinks = [...document.querySelectorAll('.article-toc a[href^="#"]')];
  const headings = [...new Set(tocLinks
    .map((link) => document.getElementById(decodeHash(link.hash.slice(1))))
    .filter(Boolean))];
  if (tocLinks.length && headings.length) {
    const setActive = (id) => {
      tocLinks.forEach((link) => {
        const active = decodeHash(link.hash.slice(1)) === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const initial = decodeHash(window.location.hash.slice(1));
    if (initial && headings.some((heading) => heading.id === initial)) setActive(initial);
    else setActive(headings[0].id);
    let scheduled = false;
    const updateActive = () => {
      scheduled = false;
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 80) current = heading;
        else break;
      }
      setActive(current.id);
    };
    const scheduleUpdate = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(updateActive);
    };
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    scheduleUpdate();
  }
})();
