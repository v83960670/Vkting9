/**
 * ESCAPE 99 — ARIN
 * A single procedural rig drives all 15 animations. Every character in the
 * catalogue is the same rig with a different palette / accessory, so the whole
 * cast costs zero download bytes and stays perfectly consistent.
 */
import { TAU, clamp, lerp, ease } from '../core/util.js';

/* ─────────────────────────────── pose system ─────────────────────────────── */

function basePose() {
  return {
    crouch: 0, // how low the body sits
    lean: 0, // forward lean in radians
    tilt: 0, // torso tilt
    headTilt: 0,
    headY: 0,
    legPhase: 0, // walking cycle
    legSpread: 0.18,
    armL: 0.4, // shoulder angle (radians, 0 = down, +ve = forward)
    armR: 0.4,
    elbowL: 0.25,
    elbowR: 0.25,
    hop: 0, // vertical offset (jumps)
    squash: 1,
    stretch: 1,
    expression: 'neutral', // neutral | happy | wide | dizzy | dead | determined | scared | closed
    mouth: 'smile',
    scarf: 0, // 0 = rest, 1 = streaming behind
    scarfLift: 0,
    spin: 0,
    itemHand: null, // 'key' | 'gem' | 'chest' | 'sword'
    sweat: 0,
    fire: 0, // knocked-back flame tint
    alpha: 1,
    flipEyes: false,
  };
}

function poseFor(anim, animT, t, ctx = {}) {
  const p = basePose();
  const speed = ctx.speedNorm ?? 0;
  switch (anim) {
    case 'idle': {
      const b = Math.sin(t * 2.2);
      p.crouch = 0.6 + b * 0.5;
      p.squash = 1 + b * 0.012;
      p.stretch = 1 - b * 0.012;
      p.armL = 0.28 + b * 0.05;
      p.armR = 0.3 - b * 0.05;
      p.scarf = 0.28 + Math.sin(t * 1.7) * 0.12;
      p.expression = ctx.blinkT < 0.12 ? 'closed' : 'happy';
      p.headTilt = Math.sin(t * 0.6) * 0.06;
      break;
    }
    case 'run': {
      const phase = (ctx.legPhase ?? 0) * TAU;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      p.legPhase = s;
      p.legSpread = 0.55;
      p.crouch = 1.4 + Math.abs(s) * 0.9;
      p.hop = -Math.abs(s) * 2.2;
      p.lean = 0.16;
      p.armL = 0.9 + s * 0.55;
      p.armR = 0.9 - s * 0.55;
      p.elbowL = 0.5 + c * 0.2;
      p.elbowR = 0.5 - c * 0.2;
      p.scarf = 0.65 + speed * 0.35;
      p.expression = 'determined';
      p.squash = 1 + Math.abs(s) * 0.02;
      break;
    }
    case 'stop': {
      const k = clamp(animT / 0.22, 0, 1);
      p.crouch = 1.2 + ease.outQuad(1 - k) * 2.4;
      p.squash = 1 + ease.outQuad(1 - k) * 0.16;
      p.stretch = 1 - ease.outQuad(1 - k) * 0.12;
      p.lean = -0.1;
      p.armL = -0.4;
      p.armR = -0.4;
      p.scarf = 0.2;
      p.expression = 'neutral';
      break;
    }
    case 'jump': {
      p.hop = -8 - Math.sin(clamp(animT / 0.5, 0, 1) * Math.PI) * 5;
      p.crouch = -1.2;
      p.legSpread = 0.85;
      p.armL = -0.9;
      p.armR = -0.9;
      p.scarf = 0.9;
      p.expression = 'wide';
      p.stretch = 1.06;
      p.squash = 0.95;
      break;
    }
    case 'dash': {
      const k = clamp(animT / 0.17, 0, 1);
      p.lean = 0.5 + k * 0.2;
      p.crouch = 2.6;
      p.armL = 1.5;
      p.armR = -1.2;
      p.legSpread = 0.9;
      p.scarf = 1;
      p.scarfLift = 0.3;
      p.expression = 'determined';
      p.stretch = 1.06;
      p.squash = 0.94;
      break;
    }
    case 'attack': {
      const k = clamp(animT / 0.3, 0, 1);
      const swing = k < 0.34 ? ease.outCubic(k / 0.34) : 1 - ease.outCubic((k - 0.34) / 0.66) * 0.75;
      p.armR = -1.5 + swing * 3.1;
      p.armL = 0.6 - swing * 0.5;
      p.lean = 0.12 + swing * 0.24;
      p.crouch = 1.6 + swing * 1.2;
      p.legSpread = 0.62;
      p.expression = 'determined';
      p.mouth = 'shout';
      p.scarf = 0.4 + swing * 0.4;
      p.itemHand = 'sword';
      p.swordSwing = swing;
      break;
    }
    case 'pickupKey': {
      const k = clamp(animT / 0.5, 0, 1);
      const bend = Math.sin(clamp(k, 0, 0.5) / 0.5 * Math.PI * 0.5);
      p.crouch = 3.4 * bend;
      p.lean = 0.34 * bend;
      p.armR = 1.4 * bend + (k > 0.55 ? -1.9 : 0);
      p.expression = 'happy';
      p.itemHand = k > 0.55 ? 'key' : null;
      p.scarf = 0.35;
      break;
    }
    case 'pickupTreasure': {
      const k = clamp(animT / 0.6, 0, 1);
      p.crouch = 2.8 * Math.sin(k * Math.PI);
      p.lean = 0.3 * Math.sin(k * Math.PI);
      p.armL = 0.3 - (k > 0.4 ? 1.6 : 0);
      p.armR = 0.3 - (k > 0.4 ? 1.6 : 0);
      p.expression = 'happy';
      p.mouth = 'open';
      p.itemHand = k > 0.4 ? 'gem' : null;
      break;
    }
    case 'hurt': {
      const k = clamp(animT / 0.42, 0, 1);
      p.lean = -0.3 - (1 - k) * 0.4;
      p.crouch = 1.6;
      p.armL = -1.1;
      p.armR = -1.1;
      p.expression = 'dizzy';
      p.mouth = 'open';
      p.squash = 1 + (1 - k) * 0.12;
      p.scarf = 0.5;
      break;
    }
    case 'death': {
      return deathPose(animT, ctx);
    }
    case 'victory': {
      const k = clamp(animT / 1.6, 0, 1);
      const jump = Math.abs(Math.sin(k * Math.PI * 2.2)) * (1 - k * 0.4);
      p.hop = -jump * 12;
      p.crouch = -1 + k * 0.6;
      p.armR = -2.35 + Math.sin(t * 6) * 0.16;
      p.armL = 0.5;
      p.expression = 'happy';
      p.mouth = 'open';
      p.scarf = 1;
      p.scarfLift = 1 - k * 0.35;
      p.legSpread = 0.7;
      break;
    }
    case 'scared': {
      p.crouch = 3.2 + Math.sin(t * 12) * 0.35;
      p.lean = -0.12;
      p.armL = -0.9 + Math.sin(t * 10) * 0.12;
      p.armR = -0.9 - Math.sin(t * 10) * 0.12;
      p.expression = 'scared';
      p.mouth = 'open';
      p.sweat = 1;
      p.squash = 1.05;
      p.scarf = 0.2;
      break;
    }
    case 'celebrate': {
      p.hop = -Math.abs(Math.sin(t * 7)) * 6;
      p.armL = -2.3;
      p.armR = -2.3;
      p.expression = 'happy';
      p.mouth = 'open';
      p.scarf = 0.8;
      p.spin = Math.sin(t * 3.4) * 0.16;
      p.legSpread = 0.5;
      break;
    }
    case 'push': {
      const k = clamp(animT / 0.45, 0, 1);
      p.lean = 0.42;
      p.crouch = 2.2 + Math.sin(k * Math.PI) * 1;
      p.armL = 1.5;
      p.armR = 1.5;
      p.expression = 'determined';
      p.legSpread = 0.7;
      p.scarf = 0.3;
      break;
    }
    case 'openChest': {
      const k = clamp(animT / 0.7, 0, 1);
      p.crouch = 3.6 * Math.sin(clamp(k * 1.4, 0, 1) * Math.PI * 0.5);
      p.lean = 0.36;
      p.armL = 1.3;
      p.armR = 1.3;
      p.expression = k > 0.55 ? 'happy' : 'neutral';
      p.mouth = k > 0.55 ? 'open' : 'smile';
      p.itemHand = k > 0.6 ? 'chest' : null;
      break;
    }
    default:
      break;
  }
  return p;
}

/** Cartoon deaths — never graphic. */
function deathPose(animT, ctx) {
  const p = basePose();
  const reason = ctx.deathReason || 'default';
  const k = clamp(animT / 1.15, 0, 1);
  if (reason === 'rock' || reason === 'boss') {
    // flattened by a rock: pancake + stars
    p.squash = 1 + ease.outCubic(Math.min(1, k * 3)) * 1.2;
    p.stretch = Math.max(0.34, 1 - ease.outCubic(Math.min(1, k * 3)) * 0.72);
    p.crouch = 6 * Math.min(1, k * 3);
    p.expression = 'dizzy';
    p.armL = -1.6;
    p.armR = -1.6;
    p.stars = true;
  } else if (reason === 'fire' || reason === 'firewall' || reason === 'lava') {
    // charred + smoke puffs
    p.squash = 1 + (1 - k) * 0.2;
    p.crouch = 2.4 + Math.sin(k * 10) * 0.8 * (1 - k);
    p.lean = Math.sin(k * 14) * 0.16 * (1 - k);
    p.expression = 'dead';
    p.mouth = 'open';
    p.itemHand = 'burnt';
    p.armL = -0.6;
    p.armR = -0.6;
    p.burnt = true;
  } else if (reason === 'spikes') {
    p.squash = 1 + Math.min(1, k * 4) * 0.3;
    p.stretch = Math.max(0.5, 1 - Math.min(1, k * 4) * 0.5);
    p.crouch = 5;
    p.expression = 'dizzy';
    p.armL = -2;
    p.armR = -2;
    p.stars = true;
  } else if (reason === 'slime') {
    p.expression = 'dizzy';
    p.crouch = 3.4 * Math.min(1, k * 3);
    p.squash = 1.1;
    p.stretch = 0.86;
    p.slime = true;
    p.armL = -0.4;
    p.armR = -0.4;
  } else {
    p.expression = 'dizzy';
    p.crouch = 3 * Math.min(1, k * 3);
    p.squash = 1.08;
    p.armL = -0.5;
    p.armR = -0.5;
  }
  return p;
}

/* ──────────────────────────────── rig drawing ────────────────────────────── */

function limb(c2d, x1, y1, a1, l1, a2, l2, w, color, handR = 0, handColor = null) {
  const x2 = x1 + Math.sin(a1) * l1;
  const y2 = y1 + Math.cos(a1) * l1;
  const a = a1 + a2;
  const x3 = x2 + Math.sin(a) * l2;
  const y3 = y2 + Math.cos(a) * l2;
  c2d.strokeStyle = color;
  c2d.lineWidth = w;
  c2d.lineCap = 'round';
  c2d.beginPath();
  c2d.moveTo(x1, y1);
  c2d.lineTo(x2, y2);
  c2d.lineTo(x3, y3);
  c2d.stroke();
  if (handR > 0) {
    c2d.fillStyle = handColor || color;
    c2d.beginPath();
    c2d.arc(x3, y3, handR, 0, TAU);
    c2d.fill();
  }
  return { x: x3, y: y3 };
}

function drawFace(c2d, p, pal, size) {
  const eyeY = -33 + p.headY;
  const eyeDX = size * 0.42;
  const r = size * 0.3;
  c2d.save();
  const closed = p.expression === 'closed';
  const dead = p.expression === 'dead';
  const dizzy = p.expression === 'dizzy';
  const wide = p.expression === 'wide' || p.expression === 'scared';
  if (dizzy || dead) {
    // X eyes
    c2d.strokeStyle = '#2a1c10';
    c2d.lineWidth = 1.8;
    c2d.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const cx = sx * eyeDX;
      c2d.beginPath();
      c2d.moveTo(cx - 3, eyeY - 3);
      c2d.lineTo(cx + 3, eyeY + 3);
      c2d.moveTo(cx + 3, eyeY - 3);
      c2d.lineTo(cx - 3, eyeY + 3);
      c2d.stroke();
    }
  } else if (closed) {
    c2d.strokeStyle = '#2a1c10';
    c2d.lineWidth = 1.6;
    c2d.lineCap = 'round';
    for (const sx of [-1, 1]) {
      c2d.beginPath();
      c2d.arc(sx * eyeDX, eyeY, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      c2d.stroke();
    }
  } else {
    // big expressive eyes
    const eyeR = wide ? r * 1.22 : r;
    for (const sx of [-1, 1]) {
      c2d.fillStyle = '#ffffff';
      c2d.beginPath();
      c2d.ellipse(sx * eyeDX, eyeY, eyeR, eyeR * (wide ? 1.18 : 1.06), 0, 0, TAU);
      c2d.fill();
      c2d.strokeStyle = 'rgba(40,26,16,0.5)';
      c2d.lineWidth = 0.9;
      c2d.stroke();
    }
    // pupils follow facing
    const look = (p.lookX ?? 0) * 1.6;
    const lookY = (p.lookY ?? 0) * 1.2;
    c2d.fillStyle = '#25331c';
    for (const sx of [-1, 1]) {
      c2d.beginPath();
      c2d.arc(sx * eyeDX + look, eyeY + lookY + (wide ? -0.4 : 0.2), eyeR * (wide ? 0.56 : 0.62), 0, TAU);
      c2d.fill();
      // sparkle
      c2d.fillStyle = '#ffffff';
      c2d.beginPath();
      c2d.arc(sx * eyeDX + look - 1.1, eyeY + lookY - 1.3, eyeR * 0.2, 0, TAU);
      c2d.fill();
      c2d.fillStyle = '#25331c';
    }
  }
  // brows for determined look
  if (p.expression === 'determined') {
    c2d.strokeStyle = pal.hair;
    c2d.lineWidth = 1.8;
    c2d.lineCap = 'round';
    for (const sx of [-1, 1]) {
      c2d.beginPath();
      c2d.moveTo(sx * eyeDX - 3.4 * sx, eyeY - 5.6);
      c2d.lineTo(sx * eyeDX + 3 * sx, eyeY - 4.2);
      c2d.stroke();
    }
  }
  // mouth
  const mouthY = eyeY + size * 0.62;
  c2d.strokeStyle = 'rgba(60,30,20,0.85)';
  c2d.lineWidth = 1.5;
  c2d.lineCap = 'round';
  if (p.mouth === 'open') {
    c2d.fillStyle = 'rgba(120,40,40,0.85)';
    c2d.beginPath();
    c2d.ellipse(0, mouthY, 2.6, 3.2, 0, 0, TAU);
    c2d.fill();
  } else if (p.mouth === 'shout') {
    c2d.fillStyle = 'rgba(120,40,40,0.9)';
    c2d.beginPath();
    c2d.ellipse(0, mouthY, 3.2, 3.8, 0, 0, TAU);
    c2d.fill();
  } else if (p.mouth === 'smile') {
    c2d.beginPath();
    c2d.arc(0, mouthY - 1.4, 3.2, 0.18 * Math.PI, 0.82 * Math.PI);
    c2d.stroke();
  }
  // sweat drop when scared
  if (p.sweat > 0) {
    c2d.fillStyle = 'rgba(140,224,255,0.95)';
    c2d.beginPath();
    c2d.ellipse(size * 0.6, eyeY - 6 + Math.sin(performance.now() / 200) * 1.2, 1.8, 2.6, 0.3, 0, TAU);
    c2d.fill();
  }
  c2d.restore();
}

function drawScarf(c2d, pal, p, pal2, size) {
  const lift = p.scarfLift ?? 0;
  const stream = p.scarf ?? 0.3;
  const cx = 0;
  const cy = -24 + p.headY;
  const cols = [pal.scarf, pal.scarfDark];
  c2d.save();
  c2d.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const w = 6 - i * 1.1;
    const t = p.sway ?? 0;
    const seg = 7 - i * 0.6;
    const ang = Math.PI / 2 + (0.35 + stream * 0.5) * (i * 0.22) + Math.sin(t * 4 + i) * 0.12 - lift * i * 0.3;
    const x = cx + Math.sin(ang) * seg * i * 0.7 + (p.lean ?? 0) * -8 * i * 0.3;
    const y = cy + Math.cos(ang) * seg * i * 0.62 - lift * i * 3.4;
    c2d.fillStyle = i === 0 ? cols[0] : cols[0];
    c2d.beginPath();
    c2d.ellipse(x, y, w * 0.55, w * 0.85, ang, 0, TAU);
    c2d.fill();
  }
  // knot
  c2d.fillStyle = cols[0];
  c2d.beginPath();
  c2d.ellipse(0, cy + 1, size * 0.46, size * 0.24, 0, 0, TAU);
  c2d.fill();
  c2d.fillStyle = cols[1];
  c2d.beginPath();
  c2d.ellipse(0, cy + 2.4, size * 0.3, size * 0.14, 0, 0, TAU);
  c2d.fill();
  if (pal2?.glow) {
    c2d.globalAlpha = 0.35;
    c2d.fillStyle = pal2.glow;
    c2d.beginPath();
    c2d.ellipse(0, cy, size * 0.6, size * 0.4, 0, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
  }
  c2d.restore();
}

/* ─────────────────────────────── main entry ──────────────────────────────── */

/**
 * @param {CanvasRenderingContext2D} c2d
 * @param {object} o
 *   x,y      — feet position in world pixels
 *   look     — resolveLook() result
 *   anim, animT, t, legPhase, speedNorm, deathReason, dir(facing), blinkT
 */
export function drawArin(c2d, o) {
  const {
    x, y, look, anim = 'idle', animT = 0, t = 0, legPhase = 0, speedNorm = 0,
    dir = 'down', deathReason = null, blinkT = 1, invuln = 0, scale = 1, alpha = 1,
  } = o;
  const pal = look.palette;
  const skin = look.skin || {};
  const p = poseFor(anim, animT, t, { legPhase, speedNorm, deathReason });
  p.sway = t;
  // eyes track the facing direction
  p.lookX = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  p.lookY = dir === 'up' ? -0.6 : dir === 'down' ? 0.4 : 0;

  const size = 11 * scale;
  const crouch = p.crouch * scale;
  const squash = p.squash ?? 1;
  const stretch = p.stretch ?? 1;
  const hop = (p.hop ?? 0) * scale;
  const lean = p.lean ?? 0;

  c2d.save();
  c2d.translate(x, y);
  if (p.spin) c2d.rotate(p.spin);
  c2d.globalAlpha = alpha;
  // blink the whole character while invulnerable
  if (invuln > 0 && Math.floor(t * 22) % 2 === 0) c2d.globalAlpha *= 0.45;

  // shadow
  c2d.save();
  c2d.globalAlpha = alpha * 0.28 * clamp(1 - Math.abs(hop) / 30, 0.4, 1);
  c2d.fillStyle = '#000';
  c2d.beginPath();
  c2d.ellipse(0, 2, 11 * scale * squash, 4.2 * scale, 0, 0, TAU);
  c2d.fill();
  c2d.restore();

  c2d.translate(0, hop + crouch);
  c2d.scale(squash, stretch);
  c2d.rotate(lean * 0.5);

  const hipY = -12 * scale;
  const shoulderY = -22 * scale + p.headY * scale;
  const legSpread = (p.legSpread ?? 0.2) * scale;
  const legL = 6.4 * scale;
  const legSwing = (p.legPhase ?? 0) * legSpread;
  const burnt = p.burnt;
  const bodyLight = burnt ? '#3a3530' : pal.shirt;
  const bodyDark = burnt ? '#241f1c' : pal.shirtDark;
  const legCol = burnt ? '#2b2724' : pal.pants;
  const skinCol = burnt ? '#5a5148' : pal.skin;
  const bootCol = burnt ? '#241f1c' : pal.boots;

  // legs
  limb(c2d, -3.2 * scale, hipY, legSwing, legL, legSwing * 0.4, legL * 0.9, 4.4 * scale, legCol, 0);
  limb(c2d, 3.2 * scale, hipY, -legSwing, legL, -legSwing * 0.4, legL * 0.9, 4.4 * scale, legCol, 0);
  // boots
  for (const sx of [-1, 1]) {
    const bx = sx * 3.2 * scale + Math.sin(-legSwing * sx) * legL;
    const by = hipY + Math.cos(legSwing * sx) * legL * 1.9;
    c2d.fillStyle = bootCol;
    c2d.beginPath();
    c2d.roundRect(bx - 3.4 * scale, by - 2.6 * scale, 7.4 * scale, 4.6 * scale, 1.8 * scale);
    c2d.fill();
    c2d.fillStyle = 'rgba(0,0,0,0.22)';
    c2d.beginPath();
    c2d.roundRect(bx - 3.4 * scale, by + 0.4 * scale, 7.4 * scale, 1.6 * scale, 0.8 * scale);
    c2d.fill();
  }

  // back arm
  const armL = limb(c2d, -6.4 * scale, shoulderY, (p.armL ?? 0.4) * -1, 7.4 * scale, p.elbowL ?? 0, 6.4 * scale, 4.2 * scale, skinCol, 2.5 * scale, skinCol);

  // body
  const bodyGrad = c2d.createLinearGradient(0, shoulderY, 0, hipY + 3);
  bodyGrad.addColorStop(0, bodyLight);
  bodyGrad.addColorStop(1, bodyDark);
  c2d.fillStyle = bodyGrad;
  c2d.beginPath();
  c2d.moveTo(-7.4 * scale, shoulderY + 1 * scale);
  c2d.quadraticCurveTo(-8.4 * scale, hipY, -5.6 * scale, hipY + 2.4 * scale);
  c2d.lineTo(5.6 * scale, hipY + 2.4 * scale);
  c2d.quadraticCurveTo(8.4 * scale, hipY, 7.4 * scale, shoulderY + 1 * scale);
  c2d.closePath();
  c2d.fill();
  // belt + golden buckle
  c2d.fillStyle = burnt ? '#241f1c' : '#4a3a26';
  c2d.fillRect(-7.2 * scale, hipY - 1.4 * scale, 14.4 * scale, 2.6 * scale);
  c2d.fillStyle = burnt ? '#6b6152' : pal.buckle || '#f6c445';
  c2d.beginPath();
  c2d.roundRect(-2 * scale, hipY - 1.8 * scale, 4 * scale, 3.4 * scale, 1 * scale);
  c2d.fill();
  // backpack
  if (!burnt) {
    c2d.fillStyle = '#7a5a38';
    c2d.beginPath();
    c2d.roundRect(-8.6 * scale, shoulderY + 2 * scale, 5 * scale, 8 * scale, 2 * scale);
    c2d.fill();
    c2d.fillStyle = '#5d4327';
    c2d.fillRect(-8.6 * scale, shoulderY + 5 * scale, 5 * scale, 1.2 * scale);
  }
  if (skin.starfield) {
    c2d.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 5; i++) {
      const a = t * 0.6 + i * 1.7;
      c2d.globalAlpha = 0.35 + Math.sin(a * 3) * 0.3;
      c2d.beginPath();
      c2d.arc(Math.cos(a) * 5 * scale, hipY - 2 * scale + Math.sin(a * 1.4) * 6 * scale, 0.9 * scale, 0, TAU);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
  }

  // scarf sits between body and head
  if (look.accessory === 'scarf' || look.accessory === 'shadowScarf') {
    drawScarf(c2d, pal, p, { glow: look.accessory === 'shadowScarf' ? '#b06bff' : null }, size);
  } else if (look.accessory === 'braid') {
    c2d.save();
    c2d.strokeStyle = pal.hair;
    c2d.lineWidth = 3.4 * scale;
    c2d.lineCap = 'round';
    c2d.beginPath();
    c2d.moveTo(-6 * scale, shoulderY + 2 * scale);
    c2d.quadraticCurveTo(-10 * scale, shoulderY + 10 * scale + Math.sin(t * 3) * 2, -7 * scale, hipY + 4 * scale);
    c2d.stroke();
    for (let i = 0; i < 3; i++) {
      c2d.fillStyle = i % 2 ? '#ffd45e' : pal.scarf;
      c2d.beginPath();
      c2d.arc(-8.6 * scale + i * 0.6, shoulderY + (5 + i * 3.4) * scale, 1.4 * scale, 0, TAU);
      c2d.fill();
    }
    c2d.restore();
  }

  // front arm
  const armR = limb(c2d, 6.4 * scale, shoulderY, (p.armR ?? 0.4), 7.4 * scale, -(p.elbowR ?? 0), 6.4 * scale, 4.2 * scale, skinCol, 2.6 * scale, skinCol);

  // held item
  const hand = armR;
  if (p.itemHand === 'key') {
    c2d.save();
    c2d.translate(hand.x, hand.y - 8 * scale);
    c2d.rotate(Math.sin(t * 4) * 0.2);
    c2d.fillStyle = '#ffd45e';
    c2d.beginPath();
    c2d.arc(0, 0, 3 * scale, 0, TAU);
    c2d.fill();
    c2d.fillRect(-1 * scale, 2 * scale, 2 * scale, 6 * scale);
    c2d.restore();
  } else if (p.itemHand === 'gem') {
    c2d.save();
    c2d.translate(hand.x, hand.y - 9 * scale);
    c2d.fillStyle = '#8ce0ff';
    c2d.beginPath();
    c2d.moveTo(0, -5 * scale);
    c2d.lineTo(3.6 * scale, 0);
    c2d.lineTo(0, 5 * scale);
    c2d.lineTo(-3.6 * scale, 0);
    c2d.closePath();
    c2d.fill();
    c2d.restore();
  }

  // head
  c2d.save();
  c2d.translate(0, p.headY * scale);
  c2d.rotate(p.headTilt ?? 0);
  const headR = size;
  // neck
  c2d.fillStyle = skinCol;
  c2d.fillRect(-2.4 * scale, -2 * scale, 4.8 * scale, 4 * scale);
  // head shape depends on body type
  c2d.fillStyle = skinCol;
  c2d.beginPath();
  if (look.body === 'boxy') {
    c2d.roundRect(-headR * 0.96, -38 * scale + headR * 0.9, headR * 1.92, headR * 1.9, 3 * scale);
  } else if (look.body === 'blob') {
    c2d.ellipse(0, -33 * scale, headR * 1.24, headR * 1.1, 0, 0, TAU);
  } else {
    c2d.ellipse(0, -33 * scale, headR * 1.12, headR * 1.04, 0, 0, TAU);
  }
  c2d.fill();
  // ear
  c2d.beginPath();
  c2d.arc(headR * 0.98, -32 * scale, 1.8 * scale, 0, TAU);
  c2d.fill();
  // hair
  c2d.fillStyle = burnt ? '#241f1c' : pal.hair;
  c2d.beginPath();
  c2d.ellipse(0, -36.4 * scale, headR * 1.02, headR * 0.62, 0, Math.PI, TAU);
  c2d.fill();
  c2d.beginPath();
  c2d.ellipse(-headR * 0.72, -34 * scale, headR * 0.34, headR * 0.5, 0.4, 0, TAU);
  c2d.fill();
  c2d.beginPath();
  c2d.ellipse(headR * 0.76, -34.6 * scale, headR * 0.3, headR * 0.44, -0.4, 0, TAU);
  c2d.fill();
  // face
  c2d.save();
  c2d.translate(0, 0);
  drawFace(c2d, p, pal, size);
  c2d.restore();
  // accessories on the head
  if (look.accessory === 'hood') {
    c2d.fillStyle = pal.shirtDark;
    c2d.beginPath();
    c2d.ellipse(0, -34 * scale, headR * 1.3, headR * 1.24, 0, Math.PI * 0.86, Math.PI * 2.14);
    c2d.fill();
  } else if (look.accessory === 'hat' || skin.hat === 'wizard') {
    c2d.fillStyle = skin.hat === 'wizard' ? '#5f43b2' : pal.shirt;
    c2d.beginPath();
    c2d.moveTo(-headR * 1.2, -39 * scale);
    c2d.lineTo(headR * 1.2, -39 * scale);
    c2d.lineTo(headR * 0.1, -60 * scale);
    c2d.closePath();
    c2d.fill();
    if (skin.hat === 'wizard') {
      c2d.fillStyle = '#ffd45e';
      c2d.beginPath();
      c2d.arc(headR * 0.05, -49 * scale, 1.6 * scale, 0, TAU);
      c2d.fill();
    }
  } else if (look.accessory === 'horns') {
    c2d.fillStyle = '#e8e2d0';
    for (const sx of [-1, 1]) {
      c2d.beginPath();
      c2d.moveTo(sx * headR * 0.7, -40 * scale);
      c2d.lineTo(sx * headR * 1.05, -47 * scale);
      c2d.lineTo(sx * headR * 0.42, -43 * scale);
      c2d.closePath();
      c2d.fill();
    }
  } else if (look.accessory === 'antenna' || skin.antenna) {
    c2d.strokeStyle = '#9aa6b5';
    c2d.lineWidth = 1.4 * scale;
    c2d.beginPath();
    c2d.moveTo(0, -42 * scale);
    c2d.lineTo(0, -50 * scale);
    c2d.stroke();
    c2d.fillStyle = skin.antenna ? '#8ce0ff' : '#ff6b5e';
    c2d.beginPath();
    c2d.arc(0, -51 * scale, 2.2 * scale, 0, TAU);
    c2d.fill();
  }
  if (skin.hat === 'pirate') {
    c2d.fillStyle = '#2b2b33';
    c2d.beginPath();
    c2d.ellipse(0, -38 * scale, headR * 1.5, headR * 0.42, 0, 0, TAU);
    c2d.fill();
    c2d.beginPath();
    c2d.moveTo(-headR, -38.5 * scale);
    c2d.quadraticCurveTo(0, -52 * scale, headR, -38.5 * scale);
    c2d.closePath();
    c2d.fill();
    c2d.fillStyle = '#ffffff';
    c2d.beginPath();
    c2d.arc(0, -42 * scale, 1.5 * scale, 0, TAU);
    c2d.fill();
  }
  if (skin.mask) {
    c2d.fillStyle = '#33384a';
    c2d.beginPath();
    c2d.ellipse(0, -30.6 * scale, headR * 1.14, headR * 0.44, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = 'rgba(255,255,255,0.25)';
    c2d.fillRect(-headR * 1.1, -31.4 * scale, headR * 2.2, 0.9 * scale);
  }
  if (skin.crown) {
    c2d.fillStyle = '#ffd45e';
    c2d.beginPath();
    c2d.moveTo(-headR * 0.95, -40 * scale);
    c2d.lineTo(-headR * 0.95, -47 * scale);
    c2d.lineTo(-headR * 0.45, -43.5 * scale);
    c2d.lineTo(0, -49 * scale);
    c2d.lineTo(headR * 0.45, -43.5 * scale);
    c2d.lineTo(headR * 0.95, -47 * scale);
    c2d.lineTo(headR * 0.95, -40 * scale);
    c2d.closePath();
    c2d.fill();
    c2d.fillStyle = '#ff6b5e';
    c2d.beginPath();
    c2d.arc(0, -43 * scale, 1.4 * scale, 0, TAU);
    c2d.fill();
  }
  if (skin.frost) {
    c2d.strokeStyle = 'rgba(215,246,255,0.9)';
    c2d.lineWidth = 1.4 * scale;
    for (let i = 0; i < 3; i++) {
      const a = t * 0.8 + i * 2.1;
      c2d.beginPath();
      c2d.moveTo(Math.cos(a) * headR * 1.5, -35 * scale + Math.sin(a) * headR * 1.1);
      c2d.lineTo(Math.cos(a) * headR * 1.8, -35 * scale + Math.sin(a) * headR * 1.4);
      c2d.stroke();
    }
  }
  if (skin.ember) {
    c2d.globalAlpha = 0.8;
    c2d.fillStyle = '#ff9f43';
    for (let i = 0; i < 2; i++) {
      const a = t * 2 + i * 3;
      c2d.beginPath();
      c2d.arc(Math.cos(a) * 6 * scale, -42 * scale - Math.abs(Math.sin(a)) * 4 * scale, 1.6 * scale, 0, TAU);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
  }
  c2d.restore(); // head

  // sword (drawn over the body, swings with the attack)
  if (p.itemHand === 'sword' && look) {
    const swing = p.swordSwing ?? 0;
    c2d.save();
    c2d.translate(armR.x, armR.y);
    const baseAng = -1.9 + swing * 3.0;
    c2d.rotate(baseAng * (dir === 'left' ? -1 : 1));
    c2d.scale(dir === 'left' ? -1 : 1, 1);
    // blade
    const g = c2d.createLinearGradient(0, 0, 0, -22 * scale);
    g.addColorStop(0, '#93a6b8');
    g.addColorStop(0.5, '#e8f0f8');
    g.addColorStop(1, '#ffffff');
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.moveTo(-1.8 * scale, 2 * scale);
    c2d.lineTo(1.8 * scale, 2 * scale);
    c2d.lineTo(1.2 * scale, -20 * scale);
    c2d.lineTo(0, -24 * scale);
    c2d.lineTo(-1.2 * scale, -20 * scale);
    c2d.closePath();
    c2d.fill();
    c2d.fillStyle = '#ffd45e';
    c2d.fillRect(-4.4 * scale, 1 * scale, 8.8 * scale, 2 * scale);
    c2d.fillStyle = '#6b4a2c';
    c2d.fillRect(-1.3 * scale, 3 * scale, 2.6 * scale, 5 * scale);
    c2d.restore();
    // slash arc
    if (anim === 'attack' && swing > 0.05 && swing < 0.95) {
      c2d.save();
      c2d.globalAlpha = (1 - Math.abs(swing - 0.5) * 2) * 0.85;
      c2d.strokeStyle = '#ffffff';
      c2d.lineWidth = 3.4 * scale;
      c2d.lineCap = 'round';
      const a0 = -1.5 + swing * 2.4;
      c2d.beginPath();
      c2d.arc(6 * scale, shoulderY + 6 * scale, 21 * scale, a0, a0 + 1.5);
      c2d.stroke();
      c2d.restore();
    }
  }
  if (p.itemHand === 'burnt' && burnt) {
    // smoke wisps
    c2d.globalAlpha = 0.5;
    c2d.fillStyle = '#8a8a90';
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.2;
      c2d.beginPath();
      c2d.arc(Math.cos(a) * 5 * scale, -40 * scale - ((t * 20 + i * 8) % 26) * scale * 0.6, 2.6 * scale, 0, TAU);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
  }
  if (p.stars) {
    c2d.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i / 3) * TAU;
      const sx = Math.cos(a) * 14 * scale;
      const sy = -34 * scale + Math.sin(a) * 5 * scale;
      c2d.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? 3.4 * scale : 1.5 * scale;
        const aa = (k / 10) * TAU - Math.PI / 2;
        const px = sx + Math.cos(aa) * rr;
        const py = sy + Math.sin(aa) * rr;
        if (k === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.closePath();
      c2d.fill();
    }
  }
  if (p.slime) {
    c2d.globalAlpha = 0.6;
    c2d.fillStyle = '#7fdc6a';
    c2d.beginPath();
    c2d.ellipse(0, -6 * scale, 12 * scale, 9 * scale, 0, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
  }
  void armL;
  c2d.restore();
}

/** Portrait avatar used by the Heroes screen and HUD. */
export function drawArinAvatar(c2d, look, size, t = 0, anim = 'idle') {
  c2d.save();
  c2d.translate(size / 2, size * 0.98);
  const s = size / 52;
  c2d.scale(s, s);
  drawArin(c2d, { x: 0, y: 0, look, anim, animT: 0.2, t, legPhase: 0, speedNorm: 0, dir: 'down', blinkT: 1 });
  c2d.restore();
}

export { lerp };
