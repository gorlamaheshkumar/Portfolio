/* ══════════════════════════════════════════════════════════
   PACKET DEPTH — Flying the Network Stack
   Mahesh Gorla · Network Engineer portfolio
   Pure vanilla JS + Three.js r128. No frameworks, no build, no CDN.
   ══════════════════════════════════════════════════════════ */

'use strict';

var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
var PR_CAP = TOUCH ? 1.5 : 2;   // cap pixelRatio lower on mobile (fill-rate)

/* frame-rate-independent damping */
function damp(cur, target, base, dt) { return cur + (target - cur) * (1 - Math.pow(1 - base, dt * 60)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* always (re)load onto the homepage — never restore scroll to a deep section */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);
addEventListener('load', function () { window.scrollTo(0, 0); });

/* ──────────────── Shaders ──────────────── */
var NODE_VERT = `
  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uVel;
  attribute float aRnd;
  attribute float aSpd;
  varying float vRnd;
  varying float vDepth;
  void main(){
    vRnd = aRnd;
    vec3 p = position;
    float t = uTime * aSpd * 0.18;
    p.x += sin(t + aRnd*6.2831)*0.6;
    p.y += cos(t*0.7 + aRnd*3.1415)*0.5;
    p.z += sin(t*0.4 + aRnd*9.4247)*0.4;
    vec2 m = uMouse * 9.0;
    vec2 diff = p.xy - m;
    float d = length(diff);
    if(d < 3.0){ float f=(3.0-d)/3.0; p.xy += normalize(diff)*f*2.6; }
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    vDepth = -mv.z;
    gl_PointSize = (2.4 + aRnd*3.0) * (260.0 / -mv.z) * (1.0 + uVel * 0.35);
    gl_Position = projectionMatrix * mv;
  }
`;
var NODE_FRAG = `
  precision mediump float;
  uniform float uReveal;
  varying float vRnd;
  varying float vDepth;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if(d > 0.5) discard;
    float a = pow(1.0 - smoothstep(0.0,0.5,d), 1.6);
    vec3 col;
    if(vRnd < 0.40)      col = vec3(0.0,0.94,1.0);   // cyan
    else if(vRnd < 0.72) col = vec3(0.48,0.17,1.0);  // purple
    else                 col = vec3(0.95,0.95,1.0);   // white core
    // depth fog -> sink distant nodes into the navy void
    float fog = clamp((vDepth - 8.0) / 46.0, 0.0, 0.85);
    col = mix(col, vec3(0.012,0.016,0.039), fog);
    a *= (0.55 + vRnd*0.45) * (1.0 - fog*0.7) * uReveal;
    gl_FragColor = vec4(col, a);
  }
`;
var LINE_VERT = `
  attribute float aAlpha;
  varying float vAlpha;
  varying float vDepth;
  void main(){
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
var LINE_FRAG = `
  precision mediump float;
  uniform vec3 uCol;
  uniform float uReveal;
  uniform float uVel;
  varying float vAlpha;
  varying float vDepth;
  void main(){
    float fog = clamp((vDepth - 8.0) / 46.0, 0.0, 0.9);
    float vBoost = 1.0 + uVel * 0.9;
    gl_FragColor = vec4(uCol * vBoost, vAlpha * (1.0 - fog) * uReveal * vBoost);
  }
`;
var PKT_VERT = `
  uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = uScale * (260.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
var PKT_FRAG = `
  precision mediump float;
  uniform float uReveal;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if(d > 0.5) discard;
    float a = pow(1.0 - smoothstep(0.0,0.5,d), 2.0);
    gl_FragColor = vec4(0.7,0.97,1.0, a * uReveal);
  }
`;

/* ──────────────── Warp tunnel (intro hyperspace) ──────────────── */
var WARP_DEPTH = 90.0;
var WARP_VERT = `
  uniform float uZ;
  uniform float uStreak;
  uniform float uDepth;
  attribute float aSide;
  attribute float aRnd;
  varying float vFade;
  varying float vRnd;
  void main(){
    vRnd = aRnd;
    vec3 p = position;
    float range = uDepth + 6.0;
    float z = mod(p.z + uZ + uDepth, range) - uDepth;   // wrap, travel toward camera
    z -= aSide * uStreak;                                // tail trails behind motion
    vec4 mv = modelViewMatrix * vec4(p.x, p.y, z, 1.0);
    float depth = -mv.z;
    vFade = smoothstep(0.0, 6.0, depth) * (1.0 - smoothstep(62.0, 96.0, depth));
    gl_Position = projectionMatrix * mv;
  }
`;
var WARP_FRAG = `
  precision mediump float;
  uniform float uOpacity;
  varying float vFade;
  varying float vRnd;
  void main(){
    vec3 col = vRnd < 0.5 ? vec3(0.6,0.95,1.0)
             : vRnd < 0.8 ? vec3(0.5,0.3,1.0)
             : vec3(1.0,1.0,1.0);
    gl_FragColor = vec4(col, vFade * uOpacity);
  }
`;

/* ──────────────── Renderer / Scene ──────────────── */
var canvas = document.getElementById('c');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, PR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 0, 26);   // held deep in fog until preloader hands off

var world = new THREE.Group();   // everything tilts together
scene.add(world);
world.visible = REDUCED;          // hidden until we drop out of warp (shown immediately if reduced-motion)

/* ──────────────── Mouse ──────────────── */
var mouse = new THREE.Vector2(), smouse = new THREE.Vector2();
addEventListener('mousemove', function (e) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
});

/* ──────────────── Nodes ──────────────── */
var N = TOUCH ? 84 : 132;   // fewer nodes on mobile (quadratic line loop)
var nodeBase = new Float32Array(N * 3);   // base spawn positions
var nodeRnd = new Float32Array(N);
var nodeSpd = new Float32Array(N);
var worldPos = [];                         // live drifted positions (CPU mirror)

// section cluster anchors along Z so the lattice has structure
var clusterZ = [10, 4, -2, -8, -14, -20];
for (var i = 0; i < N; i++) {
  var inCluster = Math.random() < 0.5;
  if (inCluster) {
    var cz = clusterZ[(Math.random() * clusterZ.length) | 0];
    nodeBase[i * 3] = (Math.random() * 2 - 1) * 8;
    nodeBase[i * 3 + 1] = (Math.random() * 2 - 1) * 5;
    nodeBase[i * 3 + 2] = cz + (Math.random() * 2 - 1) * 3;
  } else {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    var r = 5 + Math.random() * 9;
    nodeBase[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    nodeBase[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    nodeBase[i * 3 + 2] = r * Math.cos(phi);
  }
  nodeRnd[i] = Math.random();
  nodeSpd[i] = 0.4 + Math.random() * 1.4;
  worldPos[i] = { x: nodeBase[i * 3], y: nodeBase[i * 3 + 1], z: nodeBase[i * 3 + 2] };
}

var nodeGeo = new THREE.BufferGeometry();
nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodeBase.slice(), 3));
nodeGeo.setAttribute('aRnd', new THREE.BufferAttribute(nodeRnd, 1));
nodeGeo.setAttribute('aSpd', new THREE.BufferAttribute(nodeSpd, 1));

var nodeMat = new THREE.ShaderMaterial({
  vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
  uniforms: { uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uReveal: { value: REDUCED ? 1 : 0 }, uVel: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
var nodePoints = new THREE.Points(nodeGeo, nodeMat);
world.add(nodePoints);

/* ──────────────── Lines (CPU distance-culled) ──────────────── */
var CONNECT = 4.2;
var MAX_SEGS = 1200;
var lineVerts = new Float32Array(MAX_SEGS * 6);
var lineAlpha = new Float32Array(MAX_SEGS * 2);
var edges = [];   // [a,b] pairs for packet routing

var lineGeo = new THREE.BufferGeometry();
var linePos = new THREE.BufferAttribute(lineVerts, 3);
var lineAl = new THREE.BufferAttribute(lineAlpha, 1);
linePos.usage = THREE.DynamicDrawUsage;
lineAl.usage = THREE.DynamicDrawUsage;
lineGeo.setAttribute('position', linePos);
lineGeo.setAttribute('aAlpha', lineAl);
lineGeo.setDrawRange(0, 0);

var lineMat = new THREE.ShaderMaterial({
  vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
  uniforms: { uCol: { value: new THREE.Vector3(0.0, 0.94, 1.0) }, uReveal: { value: REDUCED ? 1 : 0 }, uVel: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
var lines = new THREE.LineSegments(lineGeo, lineMat);
world.add(lines);

/* ──────────────── Packets (live traffic) ──────────────── */
var PKT = 34;
var pktPos = new Float32Array(PKT * 3);
var packets = [];
for (var k = 0; k < PKT; k++) {
  // p:1 => packet resolves onto a real edge on the very first tick (no off-edge glide)
  packets.push({ a: (Math.random() * N) | 0, b: (Math.random() * N) | 0, p: 1, spd: 0.25 + Math.random() * 0.5 });
}
var pktGeo = new THREE.BufferGeometry();
var pktAttr = new THREE.BufferAttribute(pktPos, 3);
pktAttr.usage = THREE.DynamicDrawUsage;
pktGeo.setAttribute('position', pktAttr);
var pktMat = new THREE.ShaderMaterial({
  vertexShader: PKT_VERT, fragmentShader: PKT_FRAG,
  uniforms: { uScale: { value: 3.2 }, uReveal: { value: REDUCED ? 1 : 0 }, uVel: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
var pktPoints = new THREE.Points(pktGeo, pktMat);
world.add(pktPoints);
if (REDUCED) pktPoints.visible = false;   // no flying traffic under reduced-motion

/* ──────────────── Build warp tunnel ──────────────── */
var warpMat;
var warp = (function () {
  var M = TOUCH ? 900 : 1600;
  var pos = new Float32Array(M * 2 * 3);
  var side = new Float32Array(M * 2);
  var rnd = new Float32Array(M * 2);
  for (var wi = 0; wi < M; wi++) {
    // WIDE RECTANGULAR spread (not a circular tube) so streaks reach the screen corners.
    // A circular distribution leaves the corners dark, which reads as a square "frame".
    var x = (Math.random() * 2 - 1) * 20;
    var y = (Math.random() * 2 - 1) * 12;
    var z = -Math.random() * WARP_DEPTH;
    var r = Math.random();
    for (var sde = 0; sde < 2; sde++) {
      var v = wi * 2 + sde;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      side[v] = sde; rnd[v] = r;
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  warpMat = new THREE.ShaderMaterial({
    vertexShader: WARP_VERT, fragmentShader: WARP_FRAG,
    uniforms: { uZ: { value: 0 }, uStreak: { value: 0.4 }, uDepth: { value: WARP_DEPTH }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var mesh = new THREE.LineSegments(g, warpMat);
  mesh.position.z = 14;          // centred on the camera's resting position
  mesh.frustumCulled = false;
  mesh.visible = !REDUCED;
  scene.add(mesh);
  return mesh;
})();

/* ──────────────── Scroll ──────────────── */
var targetScroll = 0, curScroll = 0;
function readScroll() {
  var max = document.body.scrollHeight - innerHeight;
  targetScroll = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();

/* ──────────────── Resize ──────────────── */
addEventListener('resize', function () {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, PR_CAP));   // honour mobile fill-rate cap on resize/orientation
  readScroll();
});

/* ──────────────── Render loop ──────────────── */
var warpActive = !REDUCED;   // hyperspace intro running
var warpExiting = false;      // dropping out of warp into the network
var warpSpeed = 28;         // current tunnel velocity
var warpUZ = 0;          // accumulated travel
var boosted = false;      // Enter pressed -> 5x jump then land
var clock = new THREE.Clock();
var renderActive = true;
var idleYaw = 0;

/* scroll-velocity reactivity: one smoothed signal pumps energy through the lattice */
var scrollVel = 0, prevScroll = 0;
var lineColBase = new THREE.Vector3(0.0, 0.94, 1.0);   // resting cyan (matches uCol init)
var lineColHot = new THREE.Vector3(1.0, 0.17, 1.0);   // magenta target on fast scroll
var VEL_NORM = 9.0, VEL_RISE = 0.10, VEL_FALL = 0.045; // normalize + asymmetric attack/release

function tick() {
  requestAnimationFrame(tick);
  if (!renderActive) return;
  var dt = Math.min(clock.getDelta(), 0.05);
  var t = clock.elapsedTime;

  // smoothed inputs
  smouse.x = damp(smouse.x, mouse.x, 0.05, dt);
  smouse.y = damp(smouse.y, mouse.y, 0.05, dt);
  if (REDUCED) curScroll = targetScroll; else curScroll = damp(curScroll, targetScroll, 0.07, dt);

  // scroll velocity → energy signal (fast to rise, slow to ease out)
  if (REDUCED) { scrollVel = 0; }
  else {
    var velRaw = Math.abs(curScroll - prevScroll) / Math.max(dt, 0.0001);
    prevScroll = curScroll;
    var velGap = Math.abs(targetScroll - curScroll) * 6.0;   // register fast flicks early
    var velTarget = clamp((velRaw + velGap) / VEL_NORM, 0, 1);
    var velBase = velTarget > scrollVel ? VEL_RISE : VEL_FALL;
    scrollVel = damp(scrollVel, velTarget, velBase, dt);
    if (scrollVel < 0.0008) scrollVel = 0;                   // settle to true rest
  }

  // ── warp tunnel intro: fly through hyperspace, then drop out into the network ──
  if (warpActive) {
    var spdTarget = warpExiting ? 0 : (boosted ? 760 : 150);   // Enter -> 5x surge
    var spdLerp = warpExiting ? 0.06 : (boosted ? 0.14 : 0.018);
    warpSpeed = damp(warpSpeed, spdTarget, spdLerp, dt);
    warpUZ += warpSpeed * dt;
    warpMat.uniforms.uZ.value = warpUZ;
    warpMat.uniforms.uStreak.value = Math.min(warpSpeed * 0.06, 16);  // cap streak length
    warp.rotation.z += dt * 0.12;
    warp.rotation.x = damp(warp.rotation.x, smouse.y * 0.1, 0.08, dt);
    warp.rotation.y = damp(warp.rotation.y, -smouse.x * 0.1, 0.08, dt);
    if (warpExiting) {
      warpMat.uniforms.uOpacity.value = damp(warpMat.uniforms.uOpacity.value, 0, 0.05, dt);
      var rv = damp(nodeMat.uniforms.uReveal.value, 1, 0.045, dt);
      nodeMat.uniforms.uReveal.value = rv;
      lineMat.uniforms.uReveal.value = rv;
      pktMat.uniforms.uReveal.value = rv;
      if (warpMat.uniforms.uOpacity.value < 0.02) {
        warpActive = false; warp.visible = false;
        nodeMat.uniforms.uReveal.value = 1; lineMat.uniforms.uReveal.value = 1; pktMat.uniforms.uReveal.value = 1;
      }
    }
  }

  nodeMat.uniforms.uTime.value = REDUCED ? 0 : t;   // freeze GPU node drift under reduced-motion
  nodeMat.uniforms.uMouse.value.set(smouse.x, smouse.y);

  // CPU mirror of vertex drift + mouse repulsion (must match NODE_VERT)
  for (var i = 0; i < N; i++) {
    var s = nodeSpd[i], rn = nodeRnd[i], tt = t * s * 0.18;
    var bx = nodeBase[i * 3], by = nodeBase[i * 3 + 1], bz = nodeBase[i * 3 + 2];
    var dx = 0, dy = 0, dz = 0;
    if (!REDUCED) {
      dx = Math.sin(tt + rn * 6.2831) * 0.6;
      dy = Math.cos(tt * 0.7 + rn * 3.1415) * 0.5;
      dz = Math.sin(tt * 0.4 + rn * 9.4247) * 0.4;
    }
    var mx = smouse.x * 9.0, my = smouse.y * 9.0;
    var fx = bx + dx - mx, fy = by + dy - my, fd = Math.sqrt(fx * fx + fy * fy);
    if (fd < 3.0 && fd > 0.0001) { var f = (3.0 - fd) / 3.0, inv = 1.0 / fd; dx += fx * inv * f * 2.6; dy += fy * inv * f * 2.6; }
    worldPos[i].x = bx + dx; worldPos[i].y = by + dy; worldPos[i].z = bz + dz;
  }

  // rebuild lines + edge list
  var seg = 0; edges.length = 0;
  for (var a = 0; a < N && seg < MAX_SEGS; a++) {
    for (var b = a + 1; b < N && seg < MAX_SEGS; b++) {
      var wx = worldPos[a].x - worldPos[b].x, wy = worldPos[a].y - worldPos[b].y, wz = worldPos[a].z - worldPos[b].z;
      var dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (dist < CONNECT) {
        var al = (1.0 - dist / CONNECT) * 0.5, base = seg * 6;
        lineVerts[base] = worldPos[a].x; lineVerts[base + 1] = worldPos[a].y; lineVerts[base + 2] = worldPos[a].z;
        lineVerts[base + 3] = worldPos[b].x; lineVerts[base + 4] = worldPos[b].y; lineVerts[base + 5] = worldPos[b].z;
        lineAlpha[seg * 2] = al; lineAlpha[seg * 2 + 1] = al;
        if (edges.length < 400) edges.push(a, b);
        seg++;
      }
    }
  }
  // upload only the live portion of the buffers, not the full MAX_SEGS allocation
  linePos.updateRange.offset = 0; linePos.updateRange.count = seg * 6;
  lineAl.updateRange.offset = 0; lineAl.updateRange.count = seg * 2;
  linePos.needsUpdate = true; lineAl.needsUpdate = true;
  lineGeo.setDrawRange(0, seg * 2);

  // pipe scroll energy into the lattice materials (brighter lines, faster/larger packets, warm hue)
  if (!REDUCED) {
    nodeMat.uniforms.uVel.value = scrollVel;
    lineMat.uniforms.uVel.value = scrollVel;
    pktMat.uniforms.uVel.value = scrollVel;
    pktMat.uniforms.uScale.value = 3.2 + scrollVel * 1.3;
    var hueT = scrollVel * 0.6;   // cap blend at 60% so it never abandons brand cyan
    lineMat.uniforms.uCol.value.set(
      lineColBase.x + (lineColHot.x - lineColBase.x) * hueT,
      lineColBase.y + (lineColHot.y - lineColBase.y) * hueT,
      lineColBase.z + (lineColHot.z - lineColBase.z) * hueT
    );
  }

  // advance packets along live edges (skipped entirely under reduced-motion)
  if (!REDUCED) {
    for (var pk = 0; pk < PKT; pk++) {
      var P = packets[pk];
      P.p += P.spd * (1.0 + scrollVel * 1.6) * dt;   // traffic surges while scrolling
      if (P.p >= 1) {
        P.p = 0;
        if (edges.length) { var e = ((Math.random() * edges.length / 2) | 0) * 2; P.a = edges[e]; P.b = edges[e + 1]; }
        else { P.a = (Math.random() * N) | 0; P.b = (Math.random() * N) | 0; }
        P.spd = 0.25 + Math.random() * 0.5;
      }
      var A = worldPos[P.a], B = worldPos[P.b];
      pktPos[pk * 3] = A.x + (B.x - A.x) * P.p;
      pktPos[pk * 3 + 1] = A.y + (B.y - A.y) * P.p;
      pktPos[pk * 3 + 2] = A.z + (B.z - A.z) * P.p;
    }
    pktAttr.needsUpdate = true;
  }

  // world tilt to cursor (+ slow idle yaw)
  idleYaw = Math.sin(t * 0.25) * 0.04;
  if (!REDUCED) {
    world.rotation.y = damp(world.rotation.y, smouse.x * 0.12 + idleYaw, 0.1, dt);
    world.rotation.x = damp(world.rotation.x, -smouse.y * 0.10, 0.1, dt);
  }

  // camera fly-through: scroll = forward Z-dolly
  var camTargetZ = 14 - curScroll * 38;
  if (REDUCED) {
    camera.position.z = camTargetZ;
    camera.position.y = -curScroll * 2.5;
    camera.position.x = 0;
  } else {
    camera.position.z = damp(camera.position.z, camTargetZ, 0.06, dt);
    camera.position.y = damp(camera.position.y, -curScroll * 2.5, 0.06, dt);
    camera.position.x = damp(camera.position.x, smouse.x * 0.6, 0.06, dt);
  }
  camera.lookAt(0, -curScroll * 2.5, camera.position.z - 12);

  renderer.render(scene, camera);
}
tick();

/* ══════════════════════════════════════════════════════════
   DOM choreography
   ══════════════════════════════════════════════════════════ */

/* ── Hero per-character split ── */
function splitChars(el) {
  var text = el.textContent;
  el.textContent = '';
  for (var i = 0; i < text.length; i++) {
    var s = document.createElement('span');
    s.className = 'ch';
    s.textContent = text[i] === ' ' ? ' ' : text[i];
    el.appendChild(s);
  }
  return el.querySelectorAll('.ch');
}
var heroChars = [];
document.querySelectorAll('#hero [data-split]').forEach(function (el, li) {
  var chars = splitChars(el);
  chars.forEach(function (ch, ci) { heroChars.push({ el: ch, delay: li * 180 + ci * 28 }); });
});

/* ── Wrap [data-h2] for masked line reveal ── */
document.querySelectorAll('[data-h2]').forEach(function (h) {
  h.innerHTML = '<span class="ln"><span>' + h.innerHTML + '</span></span>';
});

function heroReveal() {
  heroChars.forEach(function (o) {
    setTimeout(function () { o.el.style.transition = 'transform .62s cubic-bezier(.34,1.56,.64,1)'; o.el.style.transform = 'translateY(0)'; }, REDUCED ? 0 : o.delay);
  });
  var fx = document.querySelectorAll('#hero [data-fx]');
  fx.forEach(function (el, i) {
    el.style.opacity = 0; el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity .8s var(--e1), transform .8s var(--e1)';
    setTimeout(function () { el.style.opacity = 1; el.style.transform = 'none'; }, REDUCED ? 0 : 700 + i * 150);
  });
}

/* ── Dynamic Experience & NOC Uptime calculation ──
   Cognizant start date: March 2025 (month index 2).
   Auto-calculates elapsed months and formats 'Xy Ym' / 'Xmo' dynamically.
   (Change the year to 2026 below if joining was March 2026). */
var COGNIZANT_START_DATE = new Date(2025, 2, 1);

(function updateExperience() {
  var now = new Date();
  var y1 = COGNIZANT_START_DATE.getFullYear();
  var m1 = COGNIZANT_START_DATE.getMonth();
  var d1 = COGNIZANT_START_DATE.getDate();

  var y2 = now.getFullYear();
  var m2 = now.getMonth();
  var d2 = now.getDate();

  var totalMonths = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) totalMonths--;
  if (totalMonths < 0) totalMonths = 0;

  var years = Math.floor(totalMonths / 12);
  var months = totalMonths % 12;

  var uptimeStr = '';
  if (years > 0 && months > 0) {
    uptimeStr = years + 'y\u00A0' + months + 'm';
  } else if (years > 0) {
    uptimeStr = years + 'y';
  } else {
    uptimeStr = months + 'm';
  }

  // Update Hero HUD uptime
  var hudUptime = document.getElementById('hud-uptime');
  if (hudUptime) hudUptime.innerHTML = uptimeStr;

  // Update Hero sub description
  var heroUptime = document.getElementById('hero-uptime');
  if (heroUptime) heroUptime.textContent = uptimeStr;

  // Update stats counter data-n attribute so countUp animates to the dynamic month count
  var expStat = document.getElementById('stat-exp');
  if (expStat) expStat.dataset.n = totalMonths;
})();

/* ── Counters (with decimals support) ── */
function countUp(el) {
  var target = parseFloat(el.dataset.n);
  var dec = parseInt(el.dataset.dec || '0', 10);
  var dur = 2000, start = performance.now();
  (function run(now) {
    var p = Math.min((now - start) / dur, 1);
    var v = (1 - Math.pow(1 - p, 3)) * target;
    el.textContent = dec ? v.toFixed(dec) : Math.round(v);
    if (p < 1) requestAnimationFrame(run);
  })(start);
}

/* ── IntersectionObserver: reveals ── */
var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (en) {
    if (!en.isIntersecting) return;
    var t = en.target;
    t.classList.add('on', 'shown');
    if (t.dataset.h2 !== undefined) t.classList.add('on');
    io.unobserve(t);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.r,[data-h2],.glass.wrap').forEach(function (el) { io.observe(el); });

/* ── Stat + cluster counters ── */
document.querySelectorAll('.stats, .clusters').forEach(function (grp) {
  new IntersectionObserver(function (es, obs) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.querySelectorAll('[data-n]').forEach(countUp);
      obs.unobserve(en.target);
    });
  }, { threshold: 0.35 }).observe(grp);
});

/* ── Experience feed: spine + amber→green ── */
var feed = document.querySelector('.feed');
if (feed) {
  new IntersectionObserver(function (es, obs) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      feed.classList.add('on');
      feed.querySelectorAll('.feed-row').forEach(function (row, i) {
        setTimeout(function () { row.classList.add('on'); }, REDUCED ? 0 : 200 + i * 220);
        setTimeout(function () { row.classList.add('ack'); }, REDUCED ? 0 : 200 + i * 220 + 500);
      });
      obs.unobserve(en.target);
    });
  }, { threshold: 0.25 }).observe(feed);
}

/* ── Skills: cluster focus-pull ── */
document.querySelectorAll('.cluster').forEach(function (cl) {
  var head = cl.querySelector('.cl-head');
  var parent = cl.parentElement;
  head.addEventListener('mouseenter', function () { parent.classList.add('focus'); cl.classList.add('hot'); });
  head.addEventListener('mouseleave', function () { parent.classList.remove('focus'); cl.classList.remove('hot'); });
});

/* ── Magnetic elements (own rAF lag via CSS transition) ── */
if (!TOUCH && !REDUCED) {
  document.querySelectorAll('[data-mag]').forEach(function (el) {
    el.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1), opacity .4s cubic-bezier(.16,1,.3,1), border-color .3s, background .3s, box-shadow .3s, color .3s';
    var mx = 0, my = 0, pressed = false;
    function applyMag() { el.style.transform = 'translate(' + mx + 'px,' + my + 'px) scale(' + (pressed ? 0.96 : 1) + ')'; }
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      mx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2) * 9;
      my = (e.clientY - (r.top + r.height / 2)) / (r.height / 2) * 9;
      applyMag();
    });
    el.addEventListener('mouseleave', function () { mx = 0; my = 0; pressed = false; el.style.transform = ''; });
    el.addEventListener('pointerdown', function () { pressed = true; applyMag(); });  // press scale composes with magnetic offset
    el.addEventListener('pointerup', function () { pressed = false; applyMag(); });
    el.addEventListener('pointercancel', function () { pressed = false; applyMag(); });  // context-menu/gesture won't leave it stuck depressed
  });
}

/* ── Project cards: tilt + cursor-follow glow ── */
document.querySelectorAll('[data-tilt]').forEach(function (card) {
  var glow = document.createElement('span');
  glow.className = 'pc-glow';
  card.appendChild(glow);
  if (TOUCH || REDUCED) return;
  card.addEventListener('mousemove', function (e) {
    if (window.__projDrag) return;            // don't tilt while drag-scrolling the carousel
    var r = card.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width - 0.5;
    var y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = 'perspective(900px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateY(-6px)';
    glow.style.left = (e.clientX - r.left) + 'px';
    glow.style.top = (e.clientY - r.top) + 'px';
  });
  card.addEventListener('mouseleave', function () { card.style.transform = ''; });
});

/* ── Copy-to-clipboard endpoints ── */
var toast = document.getElementById('toast');
var toastT;
function popToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { toast.classList.remove('show'); }, 1800);
}
document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var val = btn.dataset.copy;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(function () { popToast('COPIED ● 200 OK', btn); }, function () { popToast('COPIED ● ' + val, btn); });
    } else { popToast('COPIED ● ' + val, btn); }
  });
});

/* ── Contact form ── */
var cf = document.getElementById('cf');
if (cf) {
  var cfStatus = document.getElementById('cf-status');
  cf.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = cf.querySelector('.sub-btn');
    var orig = btn.innerHTML;
    btn.innerHTML = '<span>TX…</span>';
    setTimeout(function () {
      btn.innerHTML = '<span>Routed ✓ 200 OK</span>';
      btn.style.background = 'linear-gradient(135deg,#00ff88,#00b4d8)';
      if (cfStatus) cfStatus.textContent = 'Message routed successfully.';
    }, 700);
    setTimeout(function () { btn.innerHTML = orig; btn.style.background = ''; cf.reset(); if (cfStatus) cfStatus.textContent = ''; }, 3300);
  });
}

/* ── Nav / burger / smooth scroll ── */
var nav = document.getElementById('nav');
addEventListener('scroll', function () { nav.classList.toggle('on', scrollY > 40); }, { passive: true });
var burger = document.getElementById('burger');
var overlay = document.getElementById('overlay');
function setMenu(open) {
  burger.classList.toggle('x', open);
  overlay.classList.toggle('open', open);
  document.body.classList.toggle('lock', open);
  burger.setAttribute('aria-expanded', open ? 'true' : 'false');
}
burger.addEventListener('click', function () { setMenu(!overlay.classList.contains('open')); });
overlay.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) { setMenu(false); burger.focus(); } });
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var tgt = document.querySelector(a.getAttribute('href'));
    if (tgt) { e.preventDefault(); tgt.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); }
  });
});

/* ── Meridian ── */
var meridianFill = document.getElementById('meridian-fill');
var lastMerid = -1;
(function meridLoop() {
  var h = Math.round(clamp(curScroll, 0, 1) * 1000);
  if (h !== lastMerid) { meridianFill.style.transform = 'scaleY(' + (h / 1000) + ')'; lastMerid = h; }   // transform, not height (no layout)
  requestAnimationFrame(meridLoop);
})();

/* ══════════════════════════════════════════════════════════
   Preloader — boot handshake
   ══════════════════════════════════════════════════════════ */
(function preloader() {
  var pl = document.getElementById('preloader');
  var log = document.getElementById('pl-log');
  var numE = document.getElementById('pl-num');
  var ring = document.querySelector('.ring-prog');
  var CIRC = 2 * Math.PI * 62;                 // ring circumference (r=62)
  if (ring) { ring.style.strokeDasharray = CIRC; ring.style.strokeDashoffset = CIRC; }

  var lines = [
    { txt: 'ESTABLISHING LINK → AS-MG', cls: 'cy' },
    { txt: 'OSPF adjacency ... FULL', cls: 'ok' },
    { txt: 'Discovering 5 Nodes', cls: '' }
  ];

  var displayed = 0, target = 0, done = false, finished = false, lightStop = false;
  var startT = performance.now();

  function finish() {
    if (finished) return; finished = true;
    pl.classList.add('linkup');
    pl.setAttribute('aria-busy', 'false');
    document.removeEventListener('keydown', onKey);
    log.innerHTML += '\n<span class="final">LINK UP ● 200 OK</span>';
    if (ring) ring.style.strokeDashoffset = 0;
    if (numE) numE.textContent = 100;
    // hold the tunnel + lightning for 0.9s after LINK UP, then drop out
    setTimeout(function () {
      lightStop = true;                          // stop lightning as we exit
      warpExiting = true;                        // drop out of hyperspace
      world.visible = true;                      // network lattice crossfades in (WebGL)
      pl.style.transition = 'opacity .85s ease';
      pl.style.opacity = '0';
      // keep nav + hero hidden until the preloader is fully gone, so the
      // homepage doesn't "rise up" in the background through the fading tunnel
      setTimeout(function () {
        pl.style.display = 'none';
        document.body.classList.remove('lock');
        document.body.classList.remove('loading'); // reveal nav
        heroReveal();                               // hero rises up on a clean screen
        hookHeroMotion();                           // shimmer headline + decode eyebrow
      }, 850);
    }, 900);
  }
  function enterWarp() { boosted = true; }        // Enter / click -> 5x jump, then land
  function onKey(e) { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') enterWarp(); }

  if (REDUCED) {
    // no warp: place camera, reveal immediately (lattice already visible)
    camera.position.z = 14;
    log.textContent = 'LINK UP';
    pl.setAttribute('aria-busy', 'false');
    pl.style.display = 'none'; heroReveal();
    return;
  }

  document.body.classList.add('lock');           // no scroll during warp
  document.body.classList.add('loading');        // hide nav + hero behind the warp

  // hard failsafe: never trap the user on the preloader, even if rAF/fonts stall
  setTimeout(function () { target = 1; displayed = 1; finish(); }, 5000);

  // type the handshake lines
  var li = 0, ci = 0, buf = '';
  function type() {
    if (li >= lines.length) { done = true; return; }
    var line = lines[li];
    if (ci < line.txt.length) {
      log.innerHTML = buf + '<span class="' + line.cls + '">' + line.txt.slice(0, ci + 1) + '</span>';
      ci++;
      setTimeout(type, 26);
    } else {
      buf += '<span class="' + line.cls + '">' + line.txt + '</span>\n';
      log.innerHTML = buf;
      li++; ci = 0;
      setTimeout(type, 130);
    }
  }
  setTimeout(type, 100);   // 0.1s beat — let the tunnel establish before the handshake

  // asset readiness → target percent (lerped display)
  var fontsReady = false;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsReady = true; });
  else fontsReady = true;

  (function plLoop() {
    var elapsed = performance.now() - startT;
    var ramp = Math.min(elapsed / 1300, 1) * 0.9;
    if (boosted) target = 1;                                   // Enter -> rocket to 100%
    else if (fontsReady && done && elapsed > 900) target = 1;
    else target = Math.max(target, ramp);
    displayed += (target - displayed) * (boosted ? 0.14 : 0.08);
    if (target >= 1 && displayed > 0.992) displayed = 1;
    if (ring) ring.style.strokeDashoffset = CIRC * (1 - displayed);
    if (numE) numE.textContent = Math.round(displayed * 100);
    if (displayed >= 1) { finish(); return; }
    requestAnimationFrame(plLoop);
  })();

  // ── lightning / thunder over the tunnel ──
  (function lightning() {
    var cv = document.getElementById('bolt');
    if (!cv || !cv.getContext) return;
    var g = cv.getContext('2d');
    var ringEl = document.querySelector('.pl-ring');
    function size() { cv.width = innerWidth; cv.height = innerHeight; }
    size(); addEventListener('resize', size);
    var bolts = [], flash = 0, nextStrike = 0.25, tprev = 0;
    function strike() {
      var sx = Math.random() * cv.width, sy = -20;
      var ex = cv.width * 0.5 + (Math.random() - 0.5) * cv.width * 0.32;
      var ey = cv.height * 0.5 + (Math.random() - 0.5) * cv.height * 0.3;
      var segs = 9 + (Math.random() * 9 | 0), pts = [{ x: sx, y: sy }];
      for (var i = 1; i < segs; i++) { var u = i / segs; pts.push({ x: sx + (ex - sx) * u + (Math.random() - 0.5) * 80, y: sy + (ey - sy) * u + (Math.random() - 0.5) * 34 }); }
      pts.push({ x: ex, y: ey });
      bolts.push({ pts: pts, life: 1, w: 1 + Math.random() * 2 });
      flash = 0.5 + Math.random() * 0.4;
    }
    (function loop(ts) {
      if (lightStop) { g.clearRect(0, 0, cv.width, cv.height); return; }
      var dt = tprev ? Math.min((ts - tprev) / 1000, 0.05) : 0; tprev = ts;
      g.clearRect(0, 0, cv.width, cv.height);
      if (flash > 0) { g.fillStyle = 'rgba(150,230,255,' + (flash * 0.16) + ')'; g.fillRect(0, 0, cv.width, cv.height); flash -= dt * 3; }
      nextStrike -= dt * (boosted ? 4 : 1);
      if (nextStrike <= 0) { strike(); if (Math.random() < 0.4) strike(); nextStrike = 0.5 + Math.random() * 1.4; }
      for (var i = bolts.length - 1; i >= 0; i--) {
        var b = bolts[i]; b.life -= dt * 3.2;
        if (b.life <= 0) { bolts.splice(i, 1); continue; }
        g.globalAlpha = Math.max(0, b.life); g.strokeStyle = b.life > 0.6 ? '#e6fbff' : '#00f0ff';
        g.lineWidth = b.w; g.shadowColor = '#00f0ff'; g.shadowBlur = 16;
        g.beginPath(); g.moveTo(b.pts[0].x, b.pts[0].y);
        for (var p = 1; p < b.pts.length; p++) g.lineTo(b.pts[p].x, b.pts[p].y);
        g.stroke();
      }
      // electric sparks hugging the percentage ring
      if (ringEl && Math.random() < 0.65) {
        var rb = ringEl.getBoundingClientRect();
        var rcx = rb.left + rb.width / 2, rcy = rb.top + rb.height / 2, rr = rb.width / 2 - 3;
        var ang = Math.random() * 6.2831, ox = rcx + Math.cos(ang) * rr, oy = rcy + Math.sin(ang) * rr;
        g.globalAlpha = Math.random() * 0.7 + 0.25; g.strokeStyle = '#cffaff'; g.lineWidth = 1;
        g.shadowColor = '#00f0ff'; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + (Math.random() - 0.5) * 18, oy + (Math.random() - 0.5) * 18); g.stroke();
      }
      g.globalAlpha = 1; g.shadowBlur = 0;
      requestAnimationFrame(loop);
    })(0);
  })();

  // Enter / click anywhere -> 5x warp jump into the homepage
  pl.addEventListener('click', enterWarp);
  document.addEventListener('keydown', onKey);
})();

/* ══════════════════════════════════════════════════════════
   ✦ GLOSSY MORPHISM — dynamic motion + micro-interactions
   All blocks no-op under REDUCED; transform/opacity only.
   ══════════════════════════════════════════════════════════ */

/* ── Grid/list stagger: hook reveal, stamp per-child delay, then clear it ── */
(function staggerReveals() {
  if (REDUCED) return;
  var STEP = 42;   // 30–50ms band
  var groups = [
    { sel: '.stats', child: '.sc' },
    { sel: '.chips', child: 'span' },
    { sel: '.certs', child: '.cert-chip' }
  ];
  var sIo = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var g = en.target;
      var kids = g.querySelectorAll(g.__staggerChild);
      var maxDelay = 0;
      kids.forEach(function (k, i) {
        var d = i * STEP; if (d > maxDelay) maxDelay = d;
        k.style.transitionDelay = d + 'ms';
      });
      requestAnimationFrame(function () { g.classList.add('stagger-in'); });
      setTimeout(function () { kids.forEach(function (k) { k.style.transitionDelay = ''; }); }, maxDelay + 520);
      obs.unobserve(g);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  groups.forEach(function (grp) {
    document.querySelectorAll(grp.sel).forEach(function (el) {
      el.__staggerChild = grp.child;
      el.classList.add('stagger-ready');   // hide children only now → safe if JS fails
      sIo.observe(el);
    });
  });
})();

/* ── Heading shimmer: one light pass after a section heading reveals ── */
(function headingShimmer() {
  if (REDUCED) return;
  var hIo = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      setTimeout(function () {
        el.classList.add('shimmer');
        el.addEventListener('animationend', function onEnd() {
          el.classList.remove('shimmer');
          el.removeEventListener('animationend', onEnd);
        });
      }, 540);   // after the .ln>span masked reveal finishes rising
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-h2]').forEach(function (h) { hIo.observe(h); });
})();

/* ── Hero shimmer + eyebrow decode (called right after heroReveal()) ── */
function hookHeroMotion() {
  if (REDUCED) return;
  var h1 = document.querySelector('#hero h1');
  if (h1) {
    setTimeout(function () {
      h1.classList.add('shimmer');
      h1.addEventListener('animationend', function onEnd() {
        h1.classList.remove('shimmer');     // restores the original .grad gradient fill
        h1.removeEventListener('animationend', onEnd);
      });
    }, 1100);   // after the .ch chars finish rising
  }
  var eb = document.querySelector('#hero .eyebrow');
  if (eb) {
    var original = eb.textContent;
    var glyphs = '#%&$/<>[]{}=+*01';
    var chars = original.split('');
    var resolved = 0;
    setTimeout(function () {                  // start after the eyebrow has faded in (~700ms)
      eb.classList.add('decoding');
      eb.setAttribute('aria-hidden', 'true');   // hide the scramble from screen readers (restored below)
      var iv = setInterval(function () {
        var out = '';
        for (var i = 0; i < chars.length; i++) {
          if (i < resolved || chars[i] === ' ') out += chars[i];
          else out += glyphs[(Math.random() * glyphs.length) | 0];
        }
        eb.textContent = out;
        resolved += 1.2;
        if (resolved >= chars.length) { clearInterval(iv); eb.textContent = original; eb.classList.remove('decoding'); eb.removeAttribute('aria-hidden'); }
      }, 40);
      setTimeout(function () { clearInterval(iv); eb.textContent = original; eb.classList.remove('decoding'); eb.removeAttribute('aria-hidden'); }, 40 * Math.ceil(chars.length / 1.2) + 300);
    }, 820);
  }
}

/* ── Micro-interactions: packet bursts, chip glow, copy success, LED boot ── */
(function microFX() {
  if (REDUCED) return;

  function autoKill(n, life) {
    var killed = false;
    function kill() { if (killed) return; killed = true; if (n.parentNode) n.parentNode.removeChild(n); }
    n.addEventListener('animationend', kill, { once: true });
    setTimeout(kill, life || 900);
  }
  function spawnFixed(cls, x, y, life) {
    var n = document.createElement('span');
    n.className = cls; n.style.left = x + 'px'; n.style.top = y + 'px';
    document.body.appendChild(n); autoKill(n, life); return n;
  }
  function spawnIn(host, cls, life) {
    var n = document.createElement('span');
    n.className = cls; host.appendChild(n); autoKill(n, life); return n;
  }

  /* project cards → click ripple + packet burst from the cursor point
     (position:fixed on body so packets escape the card's overflow:hidden) */
  document.querySelectorAll('.pcard').forEach(function (card) {
    card.addEventListener('pointerdown', function (e) {
      var x = e.clientX, y = e.clientY;
      spawnFixed('fx-ripple', x, y, 600);
      var BURST = TOUCH ? 4 : 6;
      for (var i = 0; i < BURST; i++) {
        var ang = (Math.PI * 2 * i / BURST) + Math.random() * 0.5;
        var dist = 46 + Math.random() * 30;
        var p = spawnFixed('fx-pkt', x, y, 520);
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      }
    });
  });

  /* skills chips → glow pulse + sympathetic neighbours */
  document.querySelectorAll('.chips').forEach(function (group) {
    var spans = Array.prototype.slice.call(group.querySelectorAll('span'));
    spans.forEach(function (chip, idx) {
      chip.addEventListener('mouseenter', function () {
        chip.classList.remove('fx-pulse'); void chip.offsetWidth; chip.classList.add('fx-pulse');
        [spans[idx - 1], spans[idx + 1]].forEach(function (nb) {
          if (!nb) return; nb.classList.remove('fx-neighbor'); void nb.offsetWidth; nb.classList.add('fx-neighbor');
        });
      });
      chip.addEventListener('animationend', function () { chip.classList.remove('fx-pulse'); chip.classList.remove('fx-neighbor'); });
    });
  });

  /* copy success → ring + checkmark + signature panel ripple (wrap popToast) */
  var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
  if (typeof popToast === 'function') {
    var _popToast = popToast;
    popToast = function (msg, src) {       // [data-copy] handlers pass the button; focus is unreliable cross-browser
      _popToast(msg);
      var btn = src || document.activeElement;
      if (!btn || !btn.classList || !btn.classList.contains('copy')) return;
      btn.classList.add('is-copied');
      spawnIn(btn, 'fx-copyring', 560);
      var chk = document.createElement('span');
      chk.className = 'fx-copycheck'; chk.innerHTML = CHECK_SVG;
      btn.appendChild(chk);
      setTimeout(function () { chk.classList.add('is-out'); }, 900);
      chk.addEventListener('animationend', function (e) {
        if (e.animationName === 'fxCheckOut') { if (chk.parentNode) chk.parentNode.removeChild(chk); btn.classList.remove('is-copied'); }
      });
      setTimeout(function () { if (chk.parentNode) chk.parentNode.removeChild(chk); btn.classList.remove('is-copied'); }, 1400);
      var panel = btn.closest('.glass.wrap');
      if (panel) {
        var pr = panel.getBoundingClientRect(), br = btn.getBoundingClientRect();
        var wash = spawnIn(panel, 'fx-panelwash', 900);
        wash.style.left = (br.left - pr.left + br.width / 2) + 'px';
        wash.style.top = (br.top - pr.top + br.height / 2) + 'px';
      }
    };
  }

  /* HUD LED amber→green boot flicker on first reveal */
  var hud = document.querySelector('.hud');
  if (hud) {
    new IntersectionObserver(function (es, obs) {
      es.forEach(function (en) { if (!en.isIntersecting) return; en.target.classList.add('booted'); obs.unobserve(en.target); });
    }, { threshold: 0.6 }).observe(hud);
  }
})();

/* ── Perf: pause perpetual border-spin + LED ring when host is off-screen ── */
(function pauseOffscreenAnim() {
  if (REDUCED) return;
  var aIo = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { en.target.classList.toggle('anim-off', !en.isIntersecting); });
  }, { rootMargin: '120px 0px 120px 0px' });
  document.querySelectorAll('.glass.wrap, .pcard, .hud').forEach(function (el) { aIo.observe(el); });
})();

/* ── Projects carousel: arrow nav, drag-to-scroll, edge-fade dynamic effect ── */
(function projCarousel() {
  var scroller = document.querySelector('.proj-scroller');
  if (!scroller) return;
  var slides = Array.prototype.slice.call(scroller.querySelectorAll('.proj-slide'));
  var prev = document.querySelector('.proj-nav.prev');
  var next = document.querySelector('.proj-nav.next');
  var BEHAV = REDUCED ? 'auto' : 'smooth';     // honour reduced-motion for arrow/key scrolls

  function step() {
    var s = slides[0];
    var gap = parseFloat(getComputedStyle(scroller).columnGap || getComputedStyle(scroller).gap) || 0;
    var w = s ? s.getBoundingClientRect().width + gap : 0;
    return w > 1 ? w : scroller.clientWidth * 0.9;   // fall back if a slide reads 0-width
  }
  function updateNav() {
    if (!prev || !next) return;
    var max = scroller.scrollWidth - scroller.clientWidth;
    var canLeft = scroller.scrollLeft > 8;            // projects exist to the left
    var canRight = scroller.scrollLeft < max - 8;      // projects exist to the right
    // the side with more projects FLOWS (is-active); the dead-end side is constant + dim.
    // middle (both true) → both flow.
    prev.classList.toggle('is-active', canLeft);
    prev.classList.toggle('is-const', !canLeft);
    next.classList.toggle('is-active', canRight);
    next.classList.toggle('is-const', !canRight);
    prev.setAttribute('aria-disabled', String(!canLeft));   // non-colour signal for SR/keyboard
    next.setAttribute('aria-disabled', String(!canRight));
  }
  if (prev) prev.addEventListener('click', function () { if (prev.getAttribute('aria-disabled') === 'true') return; scroller.scrollBy({ left: -step(), behavior: BEHAV }); });
  if (next) next.addEventListener('click', function () { if (next.getAttribute('aria-disabled') === 'true') return; scroller.scrollBy({ left: step(), behavior: BEHAV }); });

  // dynamic effect: slides partially out of the viewport shrink + dim (coverflow-ish edge fade)
  function paint() {
    if (REDUCED) return;
    var r = scroller.getBoundingClientRect();
    slides.forEach(function (sl) {
      var s = sl.getBoundingClientRect();
      var vis = (Math.min(s.right, r.right) - Math.max(s.left, r.left)) / s.width;
      vis = vis < 0 ? 0 : vis > 1 ? 1 : vis;
      sl.style.setProperty('--s', (0.92 + vis * 0.08).toFixed(3));
      sl.style.setProperty('--o', (0.45 + vis * 0.55).toFixed(3));
    });
  }
  var ticking = false;
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(function () { paint(); updateNav(); ticking = false; }); } }
  scroller.addEventListener('scroll', function () { updateNav(); schedule(); }, { passive: true });
  addEventListener('resize', function () {
    scroller.scrollLeft = Math.min(scroller.scrollLeft, Math.max(0, scroller.scrollWidth - scroller.clientWidth));
    schedule();                                // coalesce reflow work to one frame
  });

  // drag-to-scroll for mouse users (native touch/trackpad scroll handles the rest)
  var down = false, startX = 0, startScroll = 0, moved = 0, suppressClick = false;
  scroller.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    down = true; moved = 0; suppressClick = false; startX = e.clientX; startScroll = scroller.scrollLeft;
    window.__projDrag = true;                 // tilt handler bails while dragging
    scroller.classList.add('dragging');
  });
  scroller.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > moved) moved = Math.abs(dx);
    if (moved > 8) suppressClick = true;       // only a real drag suppresses its trailing click
    scroller.scrollLeft = startScroll - dx;
  });
  function endDrag() {
    window.__projDrag = false;                 // always clear — never strand it true (fixes stuck tilt)
    if (!down) return;
    down = false; scroller.classList.remove('dragging');
    if (suppressClick) setTimeout(function () { suppressClick = false; }, 0);   // clear after the trailing click only
  }
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  addEventListener('blur', endDrag);           // failsafe if pointerup is lost (drag-out / dialog / devtools)
  // suppress the card link click ONLY right after a drag; a keyboard Enter never sets suppressClick
  scroller.addEventListener('click', function (e) { if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);

  // keyboard: left/right arrows scroll only when the region container itself is focused (not a card link)
  scroller.addEventListener('keydown', function (e) {
    if (e.target !== scroller) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); scroller.scrollBy({ left: step(), behavior: BEHAV }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scroller.scrollBy({ left: -step(), behavior: BEHAV }); }
  });

  updateNav(); paint();
})();

/* Mobile/touch has no :hover — play each project card's animation when it scrolls into view */
(function mobileCardPlay() {
  if (!TOUCH || REDUCED) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { en.target.classList.toggle('in-view', en.isIntersecting); });
  }, { threshold: 0.35 });
  document.querySelectorAll('.pcard').forEach(function (c) { io.observe(c); });
})();
