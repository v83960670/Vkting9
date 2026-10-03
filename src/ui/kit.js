/**
 * ESCAPE 99 — tiny DOM kit (no framework, no build step, instant load)
 */
import { el } from '../core/util.js';

export const btn = (label, opts = {}) => {
  const b = el('button', {
    class: `btn ${opts.class || ''} ${opts.variant ? `btn--${opts.variant}` : ''}`,
    type: 'button',
    html: label,
    disabled: !!opts.disabled,
    onclick: opts.onClick ? (e) => opts.onClick(e) : undefined,
  });
  if (opts.onPress) {
    b.addEventListener('pointerdown', () => opts.onPress(b));
  }
  return b;
};

/**
 * Currency glyphs are drawn with CSS instead of emoji: they stay crisp at every
 * size, read the same on every device (emoji fonts vary a lot) and can be
 * recoloured by the high-contrast setting. Anything else stays a text glyph.
 */
const VECTOR_ICONS = {
  '🪙': 'ico--coin',
  '💎': 'ico--gem',
  '⏱': 'ico--clock',
  '⏳': 'ico--clock ico--clock-sand',
};
export const icon = (glyph, cls = '') => {
  const vector = VECTOR_ICONS[glyph];
  return el('span', {
    class: `ico ${vector || ''} ${cls}`.trim(),
    text: vector ? '' : glyph,
    'aria-hidden': vector ? 'true' : undefined,
  });
};

export const panel = (children, cls = '') => el('section', { class: `panel ${cls}` }, children);

export const row = (children, cls = '') => el('div', { class: `row ${cls}` }, children);

export const col = (children, cls = '') => el('div', { class: `col ${cls}` }, children);

export const title = (text, cls = '') => el('h2', { class: `t-title ${cls}`, text });

export const label = (text, cls = '') => el('span', { class: `t-label ${cls}`, text });

export const chip = (text, cls = '') => el('span', { class: `chip ${cls}`, text });

export const spacer = (h = 8) => el('div', { class: 'spacer', style: `height:${h}px` });

export const bar = (value, cls = '') => {
  const fill = el('i', { class: 'bar__fill', style: `width:${Math.max(0, Math.min(1, value)) * 100}%` });
  return el('div', { class: `bar ${cls}` }, [fill]);
};

export function slider(value, { min = 0, max = 1, step = 0.05, onInput, format } = {}) {
  const out = el('span', { class: 'slider__value', text: format ? format(value) : Math.round(value * 100) + '%' });
  const input = el('input', {
    type: 'range',
    class: 'slider',
    min,
    max,
    step,
    value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      out.textContent = format ? format(v) : Math.round(v * 100) + '%';
      onInput?.(v);
    },
  });
  return el('div', { class: 'slider__wrap' }, [input, out]);
}

export function toggle(value, { onChange, on = 'ON', off = 'OFF' } = {}) {
  const state = el('span', { class: 'toggle__state', text: value ? on : off });
  const wrap = el('button', {
    class: `toggle ${value ? 'is-on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': value ? 'true' : 'false',
    onclick: (e) => {
      const next = !wrap.classList.contains('is-on');
      wrap.classList.toggle('is-on', next);
      wrap.setAttribute('aria-checked', next ? 'true' : 'false');
      state.textContent = next ? on : off;
      onChange?.(next, e);
    },
  }, [el('i', { class: 'toggle__knob' }), state]);
  return wrap;
}

export function segments(options, value, onChange) {
  const wrap = el('div', { class: 'segments' });
  options.forEach((opt) => {
    const b = el('button', {
      type: 'button',
      class: `segment ${opt.value === value ? 'is-active' : ''}`,
      text: opt.label,
      onclick: () => {
        [...wrap.children].forEach((c) => c.classList.remove('is-active'));
        b.classList.add('is-active');
        onChange?.(opt.value);
      },
    });
    wrap.appendChild(b);
  });
  return wrap;
}

/** Bottom-sheet style modal used by every non-gameplay screen. */
export function modal({ title: t, subtitle, body, actions, onClose, size = 'md', closable = true }) {
  const card = el('div', { class: `sheet sheet--${size}` }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__titles' }, [
        el('h2', { class: 'sheet__title', text: t }),
        subtitle ? el('p', { class: 'sheet__sub', text: subtitle }) : null,
      ]),
      closable ? btn('✕', { class: 'sheet__close', onClick: () => onClose?.() }) : null,
    ]),
    el('div', { class: 'sheet__body' }, body),
    actions ? el('footer', { class: 'sheet__actions' }, actions) : null,
  ]);
  const root = el('div', { class: 'sheet__scrim', onclick: (e) => e.target === root && closable && onClose?.() }, [card]);
  return { root, card };
}

export function starRow(count, total = 3, size = 'md') {
  const wrap = el('div', { class: `stars stars--${size}` });
  for (let i = 0; i < total; i++) wrap.appendChild(el('i', { class: `star ${i < count ? 'is-on' : ''}` }));
  return wrap;
}

export function spriteCanvas(drawFn, size = 96, dpr = 2) {
  const c = el('canvas', { class: 'sprite', width: size * dpr, height: size * dpr, style: `width:${size}px;height:${size}px` });
  const c2d = c.getContext('2d');
  c2d.scale(dpr, dpr);
  drawFn(c2d, size);
  return c;
}

export function toast(text, { icon: glyph = '⭐', cls = '' } = {}) {
  return el('div', { class: `toast ${cls}` }, [glyph ? el('span', { class: 'toast__ico', text: glyph }) : null, el('span', { class: 'toast__text', text })]);
}

export { el };
