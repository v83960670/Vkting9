/**
 * ESCAPE 99 — screens
 * Pure builders: every function returns DOM for a given context. The UI
 * controller (ui.js) decides when to show them.
 */
import { el, formatNumber, clamp } from '../core/util.js';
import { btn, icon, panel, row, col, spacer, slider, toggle, segments, starRow, spriteCanvas, bar } from './kit.js';
import { drawArinAvatar } from '../render/arin.js';
import { resolveLook, CHARACTERS, SKINS, TRAILS } from '../data/cosmetics.js';
import { UPGRADES, upgradeCost, ACHIEVEMENTS, DAILY_REWARDS, CHALLENGE_TEMPLATES } from '../data/progression.js';
import { WORLDS, worldForRoom } from '../data/themes.js';
import { ROOMS, getRoom, ROOM_COUNT } from '../data/levels.js';
import { weeklySummary } from '../game/weekly.js';

/* ═══════════════════════════════ MAIN MENU ═══════════════════════════════ */
export function menuScreen(ctx) {
  const { save, i18n } = ctx;
  const data = save.data;
  const room = Math.min(ROOM_COUNT, Math.max(1, data.progress.unlockedRoom));
  const totalStars = save.totalStars();
  const root = el('div', { class: 'screen screen--menu' });

  // hero stage: animated Arin in front of the dungeon door
  const stage = el('canvas', { class: 'menu__stage', width: 560, height: 520 });
  stage.style.width = 'min(78vw, 320px)';
  stage.style.height = 'min(72vw, 296px)';
  ctx.animate(stage, (c2d, w, h, t) => {
    drawMenuStage(c2d, w, h, t, resolveLook(data.cosmetics.equipped), ctx);
  });

  root.append(
    el('header', { class: 'menu__top' }, [
      el('div', { class: 'wallet' }, [
        el('div', { class: 'wallet__item' }, [icon('🪙'), el('span', { text: formatNumber(data.wallet.coins) })]),
        el('div', { class: 'wallet__item' }, [icon('💎'), el('span', { text: formatNumber(data.wallet.gems) })]),
      ]),
      btn('⚙️', { class: 'menu__gear', onClick: () => ctx.open.settings() }),
    ]),
    el('div', { class: 'menu__brand' }, [
      el('h1', { class: 'logo' }, [
        el('span', { class: 'logo__word', text: i18n.t('logo_title') }),
        el('span', { class: 'logo__num', text: i18n.t('logo_number') }),
      ]),
      el('p', { class: 'tagline', text: i18n.t('tagline') }),
    ]),
    stage,
    el('div', { class: 'menu__cta' }, [
      btn(`<span class="btn__ico">▶</span><span class="btn__main">${i18n.t('play')}</span>`, {
        class: 'btn--play',
        onClick: () => ctx.actions.play(room),
      }),
      el('button', { class: 'menu__roomchip', type: 'button', onclick: () => ctx.open.worldMap() }, [
        icon('🚪'),
        el('span', { text: i18n.t('room_of', { n: room, total: ROOM_COUNT }) }),
        el('span', { class: 'menu__stars' }, [icon('⭐'), el('span', { text: `${totalStars}/${ROOM_COUNT * 3}` })]),
      ]),
      el('div', { class: 'menu__quick' }, [
        btn(`<span class="btn__ico">♾️</span>${i18n.t('endless_escape')}`, {
          class: 'btn--ghost btn--small',
          disabled: !save.hasUnlock('endless'),
          onClick: () => ctx.actions.playEndless(),
        }),
        btn(`<span class="btn__ico">🏆</span>${i18n.t('weekly')}`, {
          class: 'btn--ghost btn--small',
          disabled: !save.hasUnlock('weekly'),
          onClick: () => ctx.actions.playWeekly(),
        }),
      ]),
      el('p', { class: 'menu__hint', text: `💡 ${i18n.t('tagline_long')}` }),
    ]),
    navBar(ctx, 'home')
  );
  return root;
}

function drawMenuStage(c2d, w, h, t, look, ctx) {
  c2d.clearRect(0, 0, w, h);
  // stone backdrop
  const g = c2d.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1f18');
  g.addColorStop(1, '#120c09');
  c2d.fillStyle = g;
  c2d.fillRect(0, 0, w, h);
  // arch of stones
  c2d.save();
  c2d.translate(w / 2, h * 0.62);
  const archR = Math.min(w, h) * 0.36;
  c2d.fillStyle = '#3d2c1e';
  c2d.beginPath();
  c2d.arc(0, 0, archR * 1.12, Math.PI, 0);
  c2d.lineTo(archR * 1.12, archR * 0.55);
  c2d.lineTo(-archR * 1.12, archR * 0.55);
  c2d.closePath();
  c2d.fill();
  c2d.fillStyle = '#5d4729';
  c2d.beginPath();
  c2d.arc(0, 0, archR, Math.PI, 0);
  c2d.lineTo(archR, archR * 0.55);
  c2d.lineTo(-archR, archR * 0.55);
  c2d.closePath();
  c2d.fill();
  // doorway glow
  const dg = c2d.createRadialGradient(0, archR * 0.1, 4, 0, archR * 0.1, archR * 0.95);
  const pulse = 0.55 + Math.sin(t * 1.6) * 0.16;
  dg.addColorStop(0, `rgba(255,220,140,${pulse})`);
  dg.addColorStop(0.6, 'rgba(120,60,20,0.55)');
  dg.addColorStop(1, 'rgba(10,6,4,0.9)');
  c2d.fillStyle = dg;
  c2d.beginPath();
  c2d.arc(0, 0, archR * 0.86, Math.PI, 0);
  c2d.lineTo(archR * 0.86, archR * 0.55);
  c2d.lineTo(-archR * 0.86, archR * 0.55);
  c2d.closePath();
  c2d.fill();
  // keystone + torches
  c2d.fillStyle = '#7d6034';
  c2d.fillRect(-14, -archR * 1.16, 28, 16);
  for (const sx of [-1, 1]) {
    const fx = sx * archR * 0.9;
    const fy = -archR * 0.2;
    const flick = 0.7 + Math.sin(t * 9 + sx) * 0.2;
    c2d.globalAlpha = 0.5 * flick;
    const tg = c2d.createRadialGradient(fx, fy, 2, fx, fy, 40);
    tg.addColorStop(0, 'rgba(255,190,80,0.9)');
    tg.addColorStop(1, 'rgba(255,120,40,0)');
    c2d.fillStyle = tg;
    c2d.beginPath();
    c2d.arc(fx, fy, 40, 0, Math.PI * 2);
    c2d.fill();
    c2d.globalAlpha = 1;
  }
  c2d.restore();
  // Arin standing (idle) + a hop every few seconds
  const hop = Math.max(0, Math.sin(t * 1.4) - 0.92) * 40;
  const scale = Math.min(w, h) / 190;
  c2d.save();
  c2d.translate(w / 2, h * 0.86 - hop * scale);
  c2d.scale(scale, scale);
  drawArinAvatar(c2d, look, 130, t, 'idle');
  c2d.restore();
  // floating sparkles
  for (let i = 0; i < 12; i++) {
    const seed = i * 37.7;
    const px = (Math.sin(seed) * 0.5 + 0.5) * w;
    const py = ((t * 14 + i * 80) % (h + 60)) * -1 + h + 30;
    c2d.globalAlpha = 0.14 + (i % 3) * 0.07;
    c2d.fillStyle = '#ffd45e';
    c2d.beginPath();
    c2d.arc(px + Math.sin(t + i) * 6, py, 1.6 + (i % 2), 0, Math.PI * 2);
    c2d.fill();
  }
  c2d.globalAlpha = 1;
  void ctx;
}

export function navBar(ctx, active) {
  const { save, i18n } = ctx;
  const items = [
    { id: 'home', icon: '🏠', label: i18n.t('home'), open: () => ctx.open.menu() },
    { id: 'heroes', icon: '🧍', label: i18n.t('heroes'), open: () => ctx.open.heroes() },
    { id: 'upgrades', icon: '⬆️', label: i18n.t('upgrades'), open: () => ctx.open.upgrades() },
    { id: 'challenges', icon: '🏆', label: i18n.t('challenges'), open: () => ctx.open.challenges() },
    { id: 'rewards', icon: '🎁', label: i18n.t('rewards'), open: () => ctx.open.rewards(), badge: save.isDailyRewardReady() },
  ];
  return el('nav', { class: 'navbar' }, items.map((it) =>
    el('button', {
      class: `navbar__item ${active === it.id ? 'is-active' : ''}`,
      type: 'button',
      onclick: it.open,
    }, [
      el('span', { class: 'navbar__ico', text: it.icon }),
      el('span', { class: 'navbar__label', text: it.label }),
      it.badge ? el('i', { class: 'navbar__badge' }) : null,
    ])
  ));
}

/* ═══════════════════════════════ WORLD MAP ═══════════════════════════════ */
export function worldMapScreen(ctx) {
  const { save, i18n } = ctx;
  const data = save.data;
  const root = el('div', { class: 'screen screen--map' });
  root.append(
    el('header', { class: 'map__top' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'map__titles' }, [
        el('h2', { class: 't-title', text: i18n.t('world_map') }),
        el('p', { class: 'sheet__sub', text: `${save.totalStars()} ⭐ · ${data.progress.totalEscapes} ${i18n.t('escaped')}` }),
      ]),
      el('div', { class: 'wallet wallet--small' }, [
        el('div', { class: 'wallet__item' }, [icon('🪙'), el('span', { text: formatNumber(data.wallet.coins) })]),
        el('div', { class: 'wallet__item' }, [icon('💎'), el('span', { text: formatNumber(data.wallet.gems) })]),
      ]),
    ])
  );

  const list = el('div', { class: 'map__worlds' });
  for (const world of WORLDS) {
    const unlocked = world.id <= (data.progress.worldUnlocked || 1);
    const worldRooms = el('div', { class: 'map__rooms' });
    for (let id = world.rooms[0]; id <= world.rooms[1]; id++) {
      const room = getRoom(id);
      const stat = data.progress.rooms[id];
      const roomUnlocked = id <= (data.progress.unlockedRoom || 1);
      const isBoss = !!room?.isBoss;
      const cell = el('button', {
        class: `roomcell ${roomUnlocked ? '' : 'is-locked'} ${isBoss ? 'is-boss' : ''} ${stat?.stars === 3 ? 'is-perfect' : ''}`,
        type: 'button',
        disabled: !roomUnlocked || !room,
        onclick: () => ctx.actions.play(id),
      }, [
        el('span', { class: 'roomcell__num', text: String(id) }),
        isBoss ? el('span', { class: 'roomcell__boss', text: '🗿' }) : null,
        stat?.stars ? starRow(stat.stars, 3, 'xs') : roomUnlocked ? null : el('span', { class: 'roomcell__lock', text: '🔒' }),
      ]);
      worldRooms.appendChild(cell);
    }
    list.appendChild(
      el('section', { class: `worldcard ${unlocked ? '' : 'is-locked'}` }, [
        el('header', { class: 'worldcard__head' }, [
          el('span', { class: 'worldcard__icon', text: world.icon }),
          el('div', {}, [
            el('h3', { class: 'worldcard__name', text: unlocked ? (world.id === 1 ? i18n.t('world1_name') : world.name) : '???' }),
            el('p', { class: 'worldcard__blurb', text: unlocked ? world.blurb : i18n.t('locked') }),
          ]),
          el('span', { class: 'worldcard__range', text: `${world.rooms[0]}–${world.rooms[1]}` }),
        ]),
        worldRooms,
      ])
    );
  }
  root.append(list);
  return root;
}

/* ═══════════════════════════════ HEROES ══════════════════════════════════ */
export function heroesScreen(ctx) {
  const { save, i18n } = ctx;
  const root = el('div', { class: 'screen screen--heroes' });
  const tabs = ['characters', 'skins', 'trails'];
  let activeTab = 'characters';
  const listWrap = el('div', { class: 'cards' });
  const equips = save.data.cosmetics.equipped;

  const catalog = { characters: CHARACTERS, skins: SKINS, trails: TRAILS };
  const renderList = () => {
    listWrap.innerHTML = '';
    for (const item of catalog[activeTab]) {
      const owned = save.ownsCosmetic(activeTab, item.id);
      const equipped = equips[activeTab === 'characters' ? 'character' : activeTab === 'skins' ? 'skin' : 'trail'] === item.id;
      const card = el('article', { class: `card ${owned ? '' : 'is-shop'} ${equipped ? 'is-equipped' : ''}` });
      const portrait = spriteCanvas((c2d, size) => {
        const look = resolveLook({
          characterId: activeTab === 'characters' ? item.id : 'arin',
          skinId: activeTab === 'skins' ? item.id : 'classic',
          trailId: 'dust',
        });
        drawArinAvatar(c2d, look, size * 0.86, performance.now() / 1000);
      }, 84);
      card.append(
        el('div', { class: 'card__top' }, [portrait, el('span', { class: `rarity rarity--${item.rarity}` })]),
        el('h3', { class: 'card__name', text: item.name }),
        el('p', { class: 'card__desc', text: item.blurb || item.unlockHint || '' }),
        el('div', { class: 'card__foot' },
          equipped
            ? [el('span', { class: 'chip chip--on', text: i18n.t('equipped') })]
            : owned
              ? [btn(i18n.t('equip'), { class: 'btn--small btn--primary', onClick: () => { save.equipCosmetic(activeTab, item.id); ctx.refresh(); } })]
              : [
                  el('span', { class: 'price' }, [icon(item.currency === 'gems' ? '💎' : '🪙'), el('span', { text: formatNumber(item.price) })]),
                  btn(i18n.t('buy'), {
                    class: 'btn--small',
                    disabled: item.currency === 'gems' ? save.data.wallet.gems < item.price : save.data.wallet.coins < item.price,
                    onClick: () => {
                      const ok = item.currency === 'gems' ? save.spendGems(item.price) : save.spendCoins(item.price);
                      if (ok) {
                        save.grantCosmetic(activeTab, item.id);
                        save.equipCosmetic(activeTab, item.id);
                        ctx.feedback.purchase(item);
                        ctx.refresh();
                      } else {
                        ctx.feedback.denied(i18n.t('not_enough_coins'));
                      }
                    },
                  }),
                ]
        )
      );
      listWrap.appendChild(card);
    }
  };
  renderList();

  root.append(
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'sheet__titles' }, [
        el('h2', { class: 't-title', text: i18n.t('heroes') }),
        el('p', { class: 'sheet__sub', text: 'Cosmetic only — nobody is stronger.' }),
      ]),
      el('div', { class: 'wallet wallet--small' }, [
        el('div', { class: 'wallet__item' }, [icon('🪙'), el('span', { text: formatNumber(save.data.wallet.coins) })]),
        el('div', { class: 'wallet__item' }, [icon('💎'), el('span', { text: formatNumber(save.data.wallet.gems) })]),
      ]),
    ]),
    segments([
      { value: 'characters', label: i18n.t('heroes') },
      { value: 'skins', label: 'SKINS' },
      { value: 'trails', label: 'TRAILS' },
    ], activeTab, (v) => {
      activeTab = v;
      renderList();
    }),
    listWrap
  );
  return root;
}

/* ═══════════════════════════════ UPGRADES ════════════════════════════════ */
export function upgradesScreen(ctx) {
  const { save, i18n } = ctx;
  const root = el('div', { class: 'screen screen--upgrades' });
  const list = el('div', { class: 'uplist' });
  const render = () => {
    list.innerHTML = '';
    for (const up of UPGRADES) {
      const level = save.upgradeLevel(up.id);
      const cost = upgradeCost(up.id, level);
      const maxed = level >= up.max;
      const affordable = cost !== null && save.data.wallet.coins >= cost;
      const pips = el('div', { class: 'pips' }, Array.from({ length: up.max }, (_, i) => el('i', { class: `pip ${i < level ? 'is-on' : ''}` })));
      list.appendChild(
        el('article', { class: `upcard ${maxed ? 'is-maxed' : ''}` }, [
          el('div', { class: 'upcard__icon', text: up.icon }),
          el('div', { class: 'upcard__body' }, [
            el('div', { class: 'upcard__head' }, [
              el('h3', { class: 'upcard__name', text: up.name }),
              el('span', { class: 'upcard__lv', text: maxed ? i18n.t('upgrade_max') : `${i18n.t('level_word')} ${level}/${up.max}` }),
            ]),
            el('p', { class: 'upcard__desc', text: up.desc }),
            el('div', { class: 'upcard__meta' }, [
              pips,
              el('span', { class: 'upcard__value', text: upgradePreview(up, level) }),
            ]),
          ]),
          maxed
            ? el('span', { class: 'chip chip--on', text: i18n.t('upgrade_max') })
            : btn(`🪙 ${formatNumber(cost)}`, {
                class: 'btn--small btn--primary',
                disabled: !affordable,
                onClick: () => {
                  if (save.spendCoins(cost)) {
                    save.setUpgrade(up.id, level + 1);
                    if (up.id === 'dash') save.setUnlock('dash', true);
                    ctx.feedback.purchase(up);
                    ctx.analytics.track('upgrade_purchased', { id: up.id, level: level + 1, cost });
                    render();
                    ctx.refresh();
                  }
                },
              }),
        ])
      );
    }
  };
  render();
  root.append(
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'sheet__titles' }, [
        el('h2', { class: 't-title', text: i18n.t('upgrades') }),
        el('p', { class: 'sheet__sub', text: 'Simple, honest upgrades.' }),
      ]),
      el('div', { class: 'wallet wallet--small' }, [el('div', { class: 'wallet__item' }, [icon('🪙'), el('span', { text: formatNumber(save.data.wallet.coins) })])]),
    ]),
    list
  );
  return root;
}

function upgradePreview(up, level) {
  const now = up.effect(level);
  const next = up.effect(Math.min(up.max, level + 1));
  const fmt = (v) => (typeof v === 'boolean' ? (v ? '✔' : '—') : typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : String(v));
  return level >= up.max ? fmt(now) : `${fmt(now)} → ${fmt(next)}`;
}

/* ═══════════════════════════ CHALLENGES / DAILY ═════════════════════════ */
export function challengesScreen(ctx) {
  const { save, i18n, challenges } = ctx;
  const root = el('div', { class: 'screen screen--challenges' });
  const body = el('div', { class: 'chalbody' });
  const tabs = ['daily', 'achievements', 'weekly'];
  let active = 'daily';
  const renderBody = () => {
    body.innerHTML = '';
    if (active === 'daily') {
      const list = challenges.ensureDaily();
      body.appendChild(el('p', { class: 'sheet__sub', text: 'Three rotating challenges. No punishment for missing a day.' }));
      for (const ch of list) {
        body.appendChild(
          el('article', { class: `chcard ${ch.done ? 'is-done' : ''}` }, [
            el('span', { class: 'chcard__icon', text: ch.icon }),
            el('div', { class: 'chcard__body' }, [
              el('p', { class: 'chcard__text', text: ch.text }),
              bar(clamp(ch.progress / ch.target, 0, 1)),
              el('span', { class: 'chcard__prog', text: `${Math.min(ch.progress, ch.target)} / ${ch.target}` }),
            ]),
            el('div', { class: 'chcard__right' }, [
              el('span', { class: 'price' }, [icon(ch.reward.type === 'gems' ? '💎' : ch.reward.type === 'chest' ? '🎁' : '🪙'), el('span', { text: ch.reward.type === 'chest' ? 'CHEST' : formatNumber(ch.reward.amount) })]),
              ch.claimed
                ? el('span', { class: 'chip chip--on', text: i18n.t('claimed') })
                : btn(i18n.t('claim'), {
                    class: 'btn--small btn--primary',
                    disabled: !ch.done,
                    onClick: () => {
                      const reward = challenges.claimDaily(ch);
                      if (reward) ctx.feedback.reward(reward);
                      renderBody();
                      ctx.refresh();
                    },
                  }),
            ]),
          ])
        );
      }
    } else if (active === 'achievements') {
      for (const a of ACHIEVEMENTS) {
        const unlocked = save.hasAchievement(a.id);
        const value = ctx.achievementProgress(a);
        body.appendChild(
          el('article', { class: `chcard chcard--ach ${unlocked ? 'is-done' : ''}` }, [
            el('span', { class: 'chcard__icon', text: unlocked ? a.icon : '🔒' }),
            el('div', { class: 'chcard__body' }, [
              el('div', { class: 'chcard__head' }, [
                el('strong', { class: 'chcard__title', text: i18n.t(`ach_${a.id}`) !== `ach_${a.id}` ? i18n.t(`ach_${a.id}`) : a.title }),
                el('span', { class: 'chcard__prog', text: `${Math.min(value, a.goal)} / ${a.goal}` }),
              ]),
              el('p', { class: 'chcard__text', text: a.desc }),
              bar(clamp(value / a.goal, 0, 1)),
            ]),
          ])
        );
      }
    } else {
      const w = weeklySummary();
      body.appendChild(
        el('article', { class: 'chcard chcard--weekly' }, [
          el('span', { class: 'chcard__icon', text: '🏆' }),
          el('div', { class: 'chcard__body' }, [
            el('h3', { class: 'chcard__title', text: `${i18n.t('weekly')} — ${w.name}` }),
            el('p', { class: 'chcard__text', text: i18n.t('weekly_desc') }),
            el('div', { class: 'mods' }, w.modifiers.map((m) => el('span', { class: 'chip' }, [icon(m.icon), el('span', { text: m.label })]))),
            el('p', { class: 'chcard__text', text: `Local best: ${save.data.progress.weeklyBest || 0}` }),
          ]),
        ]),
        el('p', { class: 'sheet__sub', text: 'Online leaderboards need a server — this build tracks a personal best.' })
      );
      body.appendChild(
        btn(`▶ ${i18n.t('weekly')}`, {
          class: 'btn--primary',
          disabled: !save.hasUnlock('weekly'),
          onClick: () => ctx.actions.playWeekly(),
        })
      );
    }
  };
  renderBody();
  root.append(
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'sheet__titles' }, [
        el('h2', { class: 't-title', text: i18n.t('challenges') }),
        el('p', { class: 'sheet__sub', text: `${save.totalStars()} ⭐ collected` }),
      ]),
    ]),
    segments([
      { value: 'daily', label: i18n.t('daily_challenges') },
      { value: 'achievements', label: i18n.t('achievements') },
      { value: 'weekly', label: i18n.t('weekly') },
    ], active, (v) => {
      active = v;
      renderBody();
    }),
    body
  );
  return root;
}

/* ═══════════════════════════════ REWARDS ════════════════════════════════ */
export function rewardsScreen(ctx) {
  const { save, i18n, challenges } = ctx;
  const root = el('div', { class: 'screen screen--rewards' });
  const grid = el('div', { class: 'dailygrid' });
  const render = () => {
    grid.innerHTML = '';
    const streak = save.data.daily.streak || 0;
    const ready = save.isDailyRewardReady();
    DAILY_REWARDS.forEach((reward, i) => {
      const day = i + 1;
      const claimed = day <= streak;
      const current = ready && day === streak + 1;
      grid.appendChild(
        el('div', { class: `dailycard ${claimed ? 'is-claimed' : ''} ${current ? 'is-current' : ''}` }, [
          el('span', { class: 'dailycard__day', text: i18n.t('day_n', { n: day }) }),
          el('span', { class: 'dailycard__ico', text: reward.icon }),
          el('span', { class: 'dailycard__label', text: reward.label }),
          claimed ? el('span', { class: 'dailycard__tick', text: '✓' }) : null,
        ])
      );
    });
    const claimBtn = btn(ready ? `🎁 ${i18n.t('claim')}` : `✓ ${i18n.t('daily_done')}`, {
      class: 'btn--primary',
      disabled: !ready,
      onClick: () => {
        const day = save.claimDailyReward();
        if (day) {
          const reward = DAILY_REWARDS[Math.min(DAILY_REWARDS.length - 1, day - 1)];
          challenges.grant(reward);
          ctx.feedback.reward(reward);
          render();
          ctx.refresh();
        }
      },
    });
    const holder = grid.parentElement?.querySelector('.dailyclaim');
    if (holder) holder.replaceChildren(claimBtn);
    return claimBtn;
  };
  const first = render();
  root.append(
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'sheet__titles' }, [
        el('h2', { class: 't-title', text: i18n.t('daily_rewards') }),
        el('p', { class: 'sheet__sub', text: 'Login 7 days for a special cosmetic.' }),
      ]),
    ]),
    grid,
    el('div', { class: 'dailyclaim' }, [first]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: 'FREE COINS' }),
      el('p', { class: 'sheet__sub', text: 'Optional rewarded video. Never required to play.' }),
      btn(`▶ ${i18n.t('watch_for_coins', { n: 50 })}`, {
        class: 'btn--ghost',
        onClick: () =>
          ctx.ads.watch('bonus_coins', () => {
            save.addCoins(50);
            ctx.feedback.reward({ type: 'coins', amount: 50, icon: '🪙' });
            ctx.refresh();
          }),
      }),
    ], 'panel--tight'),
    el('p', { class: 'legal', text: 'No loot boxes · No wagering · No pay-to-win · Rewards are always shown before you watch.' })
  );
  return root;
}

/* ═══════════════════════════════ SETTINGS ═══════════════════════════════ */
export function settingsScreen(ctx) {
  const { save, i18n, audio } = ctx;
  const s = save.data.settings;
  const root = el('div', { class: 'screen screen--settings' });
  const set = (key, value, after) => {
    save.setSetting(key, value);
    after?.();
  };
  root.append(
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.menu() }),
      el('div', { class: 'sheet__titles' }, [el('h2', { class: 't-title', text: i18n.t('settings') })]),
    ]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: i18n.t('set_audio') }),
      settingRow(i18n.t('music_volume'), slider(s.music, { onInput: (v) => set('music', v, () => audio.setMusicVolume(v)) })),
      settingRow(i18n.t('sfx_volume'), slider(s.sfx, { onInput: (v) => set('sfx', v, () => audio.setSfxVolume(v)) })),
      settingRow(i18n.t('vibration'), toggle(s.vibration, { on: i18n.t('on'), off: i18n.t('off'), onChange: (v) => set('vibration', v, () => ctx.haptics.setEnabled(v)) })),
    ]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: i18n.t('set_controls') }),
      settingRow(i18n.t('control_swipe'), segments([
        { value: 'swipe', label: i18n.t('control_swipe') },
        { value: 'joystick', label: i18n.t('control_joystick') },
      ], s.control, (v) => set('control', v))),
      settingRow(i18n.t('left_handed'), toggle(s.leftHanded, { on: i18n.t('on'), off: i18n.t('off'), onChange: (v) => set('leftHanded', v) })),
    ]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: i18n.t('set_accessibility') }),
      settingRow(i18n.t('screen_shake'), segments([
        { value: false, label: i18n.t('shake_normal') },
        { value: true, label: i18n.t('shake_reduced') },
      ], s.reducedShake, (v) => set('reducedShake', v, () => ctx.game?.setShakeScale()))),
      settingRow(i18n.t('hazard_contrast'), toggle(s.highContrast, { on: i18n.t('on'), off: i18n.t('off'), onChange: (v) => set('highContrast', v) })),
      settingRow(i18n.t('perf_mode'), segments([
        { value: false, label: i18n.t('fps_60') },
        { value: true, label: i18n.t('fps_30') },
      ], s.perfMode, (v) => set('perfMode', v, () => ctx.game && (ctx.game.fpsCap = v ? 30 : 60)))),
      settingRow(i18n.t('language'), el('div', { class: 'langlist' }, ctx.languages().map((l) =>
        btn(l.label, {
          class: `btn--small ${l.code === ctx.i18n.lang ? 'btn--primary' : 'btn--ghost'} ${l.placeholder ? 'is-disabled' : ''}`,
          disabled: !!l.placeholder,
          onClick: () => {
            ctx.i18n.setLanguage(l.code);
            ctx.refresh();
          },
        })
      ))),
    ]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: i18n.t('analytics') }),
      el('p', { class: 'sheet__sub', text: i18n.t('analytics_note') }),
      settingRow(i18n.t('analytics'), toggle(s.analytics, { on: i18n.t('on'), off: i18n.t('off'), onChange: (v) => set('analytics', v, () => ctx.analytics.setEnabled(v)) })),
      row([
        btn(i18n.t('export_data'), { class: 'btn--ghost btn--small', onClick: () => ctx.exportAnalytics() }),
        btn(i18n.t('how_to_play'), { class: 'btn--ghost btn--small', onClick: () => ctx.open.howTo() }),
      ]),
    ]),
    panel([
      el('h3', { class: 't-title t-title--sm', text: i18n.t('support') }),
      el('p', { class: 'sheet__sub', text: 'ESCAPE 99 · 99 Rooms. One Way Out. Built with plain HTML5 — no ads that lie, no dark patterns, no pay-to-win.' }),
      row([
        btn('ℹ️ ABOUT / INSTALL AS APP', {
          class: 'btn--ghost btn--small',
          onClick: () => document.getElementById('page')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        }),
        btn(i18n.t('reset_save'), {
          class: 'btn--danger btn--small',
          onClick: () => {
            if (confirm(i18n.t('reset_confirm'))) {
              save.hardReset();
              location.reload();
            }
          },
        }),
      ]),
    ])
  );
  return root;
}

function settingRow(labelText, control) {
  return el('div', { class: 'setrow' }, [el('span', { class: 'setrow__label', text: labelText }), el('div', { class: 'setrow__control' }, [control])]);
}

/* ═══════════════════════════════ HOW TO PLAY ════════════════════════════ */
export function howToScreen(ctx) {
  const { i18n } = ctx;
  const items = [
    ['👆', i18n.t('t_swipe'), 'Swipe anywhere to move one tile. Keep your thumb down to keep walking.'],
    ['🔑', i18n.t('t_key_found'), 'Grab the golden key — the exit only opens with it.'],
    ['🚪', i18n.t('t_exit_open'), 'Reach the glowing door to escape the room.'],
    ['⭐', 'THREE STARS', 'Escape · collect every coin · finish the room challenge.'],
    ['🪙', 'COINS', 'Spend on upgrades and cosmetics between rooms.'],
    ['💎', 'GEMS', 'Rare. Hidden rooms, bosses and daily challenges.'],
    ['⚔️', 'SWORD', 'Room 6 gives you the blade. Tap to slash.'],
    ['🗿', 'BOSSES', 'Dodge, wait for the stun window, then strike.'],
  ];
  return el('div', { class: 'screen screen--howto' }, [
    el('header', { class: 'sheet__head' }, [
      btn('←', { class: 'btn--ghost btn--icon', onClick: () => ctx.open.settings() }),
      el('div', { class: 'sheet__titles' }, [el('h2', { class: 't-title', text: i18n.t('how_to_play') })]),
    ]),
    el('div', { class: 'howto' }, items.map(([ico, title, text]) =>
      el('article', { class: 'howto__item' }, [
        el('span', { class: 'howto__ico', text: ico }),
        el('div', {}, [el('strong', { class: 'howto__title', text: title }), el('p', { class: 'howto__text', text })]),
      ])
    )),
  ]);
}

/* ═══════════════════════════════ RESULTS ════════════════════════════════ */
export function resultsBody(ctx, results) {
  const { i18n, save } = ctx;
  const modeEndless = results.mode === 'endless';
  const wrap = el('div', { class: 'results' });
  wrap.append(
    el('div', { class: 'results__stars' }, [starRow(results.stars, 3, 'lg')]),
    el('div', { class: 'results__stats' }, [
      statTile(i18n.t('time'), fmtTime(results.time), '⏱'),
      statTile(i18n.t('coins'), `+${formatNumber(results.coins)}`, '🪙'),
      statTile(i18n.t('gems'), `+${formatNumber(results.gems)}`, '💎'),
    ])
  );
  if (modeEndless) {
    wrap.append(
      el('div', { class: 'results__endless' }, [
        el('span', { class: 'results__scorelabel', text: i18n.t('score') }),
        el('strong', { class: 'results__score', text: formatNumber(results.endlessScore ?? 0) }),
        el('span', { class: 'chip', text: `${i18n.t('rooms')}: ${results.endless?.rooms ?? 0}` }),
        el('span', { class: 'chip', text: `${i18n.t('best')}: ${i18n.t('score')} ${formatNumber(save.data.progress.endlessBest)}` }),
      ])
    );
  }
  if (results.bonuses?.length) {
    wrap.append(
      el('div', { class: 'results__bonuses' }, results.bonuses.map((b) =>
        el('div', { class: 'bonusrow' }, [el('span', { text: i18n.t(b.key) }), el('strong', {}, [el('span', { text: `+${b.amount}` }), icon('🪙')])])
      ))
    );
  }
  const challengeText = results.challenge
    ? `${results.challengeDone ? '✅' : '⬜'} ${results.challenge.text || results.challenge.short}`
    : null;
  wrap.append(
    el('div', { class: 'results__checks' }, [
      el('span', { class: 'chip chip--on', text: `✅ ${i18n.t('star_escape')}` }),
      el('span', { class: `chip ${results.allCoins ? 'chip--on' : ''}`, text: `${results.allCoins ? '✅' : '⬜'} ${i18n.t('star_coins')}` }),
      challengeText ? el('span', { class: `chip ${results.challengeDone ? 'chip--on' : ''}`, text: challengeText }) : null,
    ])
  );
  if (results.improved?.bestTime) wrap.append(el('p', { class: 'results__newbest', text: `🏅 ${i18n.t('new_best')}` }));
  if (results.stars === 3) wrap.append(el('p', { class: 'results__newbest', text: `🌟 ${i18n.t('perfect')}` }));
  return wrap;
}

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};
const statTile = (labelText, value, ico) =>
  el('div', { class: 'tile' }, [el('span', { class: 'tile__ico', text: ico }), el('span', { class: 'tile__label', text: labelText }), el('strong', { class: 'tile__value', text: value })]);

export { fmtTime };
