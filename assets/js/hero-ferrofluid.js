/**
 * Ferrofluid — WebGL fluid background effect
 * Converted from React Bits (https://reactbits.dev) to vanilla WebGL
 * Original uses OGL; this implementation uses raw WebGL 1.0 with zero dependencies.
 */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var bg = document.getElementById('hero3dBg');
  if (!hero || !bg) return;

  // ── Remove any existing canvas ──
  var oldCanvas = document.getElementById('hero3dCanvas');
  if (oldCanvas) oldCanvas.remove();

  // ── Configuration ──
  var MAX_COLORS = 8;

  var config = {
    colors: ['#e8483b', '#c0392b', '#8b1a1a'],
    speed: 0.5,
    scale: 1,
    turbulence: 1,
    fluidity: 0.1,
    rimWidth: 0.2,
    sharpness: 3,
    shimmer: 1,
    glow: 2,
    flowDirection: 'down',
    opacity: 1,
    mouseInteraction: true,
    mouseStrength: 1,
    mouseRadius: 0.3,
    mouseDampening: 0.15,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    paused: false
  };

  // ── Helpers ──
  function hexToRGB(hex) {
    var c = hex.replace('#', '').padEnd(6, '0');
    return [
      parseInt(c.slice(0, 2), 16) / 255,
      parseInt(c.slice(2, 4), 16) / 255,
      parseInt(c.slice(4, 6), 16) / 255
    ];
  }

  function prepColors(input) {
    var base = (input && input.length ? input : ['#4F46E5', '#06B6D4', '#E0F2FE']).slice(0, MAX_COLORS);
    var count = base.length;
    var arr = [];
    for (var i = 0; i < MAX_COLORS; i++) {
      arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
    }
    var avg = [0, 0, 0];
    for (var j = 0; j < count; j++) {
      avg[0] += arr[j][0];
      avg[1] += arr[j][1];
      avg[2] += arr[j][2];
    }
    avg[0] /= count; avg[1] /= count; avg[2] /= count;
    return { arr: arr, count: count, avg: avg };
  }

  function flowVec(d) {
    switch (d) {
      case 'up': return [0, 1];
      case 'down': return [0, -1];
      case 'left': return [-1, 0];
      case 'right': return [1, 0];
      default: return [0, -1];
    }
  }

  // ── Shaders ──
  var vertexSrc = [
    'attribute vec2 position;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentSrc = [
    'precision highp float;',
    '',
    'uniform vec3  iResolution;',
    'uniform vec2  iMouse;',
    'uniform float iTime;',
    '',
    'uniform vec3  uColor0;',
    'uniform vec3  uColor1;',
    'uniform vec3  uColor2;',
    'uniform vec3  uColor3;',
    'uniform vec3  uColor4;',
    'uniform vec3  uColor5;',
    'uniform vec3  uColor6;',
    'uniform vec3  uColor7;',
    'uniform float uColorCount;',
    '',
    'uniform vec3  uMouseColor;',
    'uniform vec2  uFlow;',
    'uniform float uSpeed;',
    'uniform float uScale;',
    'uniform float uTurbulence;',
    'uniform float uFluidity;',
    'uniform float uRimWidth;',
    'uniform float uSharpness;',
    'uniform float uShimmer;',
    'uniform float uGlow;',
    'uniform float uOpacity;',
    'uniform float uMouseEnabled;',
    'uniform float uMouseStrength;',
    'uniform float uMouseRadius;',
    '',
    'varying vec2 vUv;',
    '',
    '#define PI 3.14159265',
    '',
    'vec3 palette(float h) {',
    '  float count = max(uColorCount, 1.0);',
    '  float idx = floor(clamp(h, 0.0, 0.999999) * count);',
    '  if (idx <= 0.5) return uColor0;',
    '  if (idx <= 1.5) return uColor1;',
    '  if (idx <= 2.5) return uColor2;',
    '  if (idx <= 3.5) return uColor3;',
    '  if (idx <= 4.5) return uColor4;',
    '  if (idx <= 5.5) return uColor5;',
    '  if (idx <= 6.5) return uColor6;',
    '  return uColor7;',
    '}',
    '',
    'float hash(vec3 p3) {',
    '  p3 = fract(p3 * 0.1031);',
    '  p3 += dot(p3, p3.zyx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    'float smin(float a, float b, float k) {',
    '  float r = exp2(-a / k) + exp2(-b / k);',
    '  return -k * log2(r);',
    '}',
    '',
    'float sinlerp(float a, float b, float w) {',
    '  return mix(a, b, (sin(w * PI - PI / 2.0) + 1.0) / 2.0);',
    '}',
    '',
    'float vn(vec2 p, float s, float seed) {',
    '  vec2 cellp = floor(p / s);',
    '  vec2 relp = mod(p, s);',
    '  float g1 = hash(vec3(cellp, seed));',
    '  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));',
    '  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));',
    '  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));',
    '  float bx = sinlerp(g1, g2, relp.x / s);',
    '  float tx = sinlerp(g4, g3, relp.x / s);',
    '  return sinlerp(bx, tx, relp.y / s);',
    '}',
    '',
    'float dbn(vec2 p, float s, float seed) {',
    '  float o = s / 2.0;',
    '  float n0 = vn(p, s, seed);',
    '  float n1 = vn(p + vec2(o, o), s, seed + 0.1);',
    '  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);',
    '  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);',
    '  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);',
    '  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;',
    '}',
    '',
    'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
    '  float ref = 700.0 / max(uScale, 0.05);',
    '  vec2 p = fragCoord / iResolution.y * ref;',
    '',
    '  float spd = 200.0 * uSpeed;',
    '  float t = iTime;',
    '',
    '  vec2 dir = uFlow;',
    '  vec2 perp = vec2(-dir.y, dir.x);',
    '',
    '  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0 * uTurbulence;',
    '  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0 * uTurbulence;',
    '',
    '  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);',
    '  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);',
    '',
    '  float mapeaks = smin(peaks, peaks2, max(uFluidity, 0.001));',
    '',
    '  float mGlow = 0.0;',
    '  if (uMouseEnabled > 0.5) {',
    '    vec2 mp = iMouse / iResolution.y * ref;',
    '    float md = length(p - mp) / ref;',
    '    float rr = max(uMouseRadius, 0.02);',
    '    mGlow = exp(-md * md / (rr * rr)) * uMouseStrength;',
    '  }',
    '',
    '  float band = (uRimWidth - abs((mapeaks - 0.4) * 2.0)) * 5.0;',
    '  float ltn = clamp(band - vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * uShimmer, 0.0, 1.0);',
    '  ltn = pow(ltn, uSharpness) * uGlow;',
    '  ltn *= clamp(1.0 - mGlow, 0.0, 1.0);',
    '',
    '  float h = clamp(0.5 + (peaks - peaks2) * 0.8, 0.0, 1.0);',
    '  vec3 col = palette(h);',
    '',
    '  vec3 outc = col * ltn;',
    '  float a = clamp(max(outc.r, max(outc.g, outc.b)), 0.0, 1.0);',
    '  fragColor = vec4(outc, a * uOpacity);',
    '}',
    '',
    'void main() {',
    '  vec4 color;',
    '  mainImage(color, vUv * iResolution.xy);',
    '  gl_FragColor = color;',
    '}'
  ].join('\n');

  // ── WebGL setup ──
  var canvas = document.createElement('canvas');
  canvas.id = 'hero3dCanvas';
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
  bg.insertBefore(canvas, bg.firstChild);

  var gl = canvas.getContext('webgl', { alpha: true, antialias: true })
        || canvas.getContext('experimental-webgl', { alpha: true, antialias: true });
  if (!gl) { console.warn('WebGL not supported — Ferrofluid disabled'); return; }

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // ── Compile shader ──
  function createShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  var vShader = createShader(gl.VERTEX_SHADER, vertexSrc);
  var fShader = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
  if (!vShader || !fShader) return;

  var program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Program link error:', gl.getProgramInfoLog(program));
    return;
  }

  // ── Attribute locations ──
  var aPosition = gl.getAttribLocation(program, 'position');
  var aUV = gl.getAttribLocation(program, 'uv');

  // ── Uniform locations ──
  var u = {};
  var uniformNames = [
    'iResolution', 'iMouse', 'iTime',
    'uColor0', 'uColor1', 'uColor2', 'uColor3',
    'uColor4', 'uColor5', 'uColor6', 'uColor7',
    'uColorCount',
    'uMouseColor', 'uFlow', 'uSpeed', 'uScale',
    'uTurbulence', 'uFluidity', 'uRimWidth', 'uSharpness',
    'uShimmer', 'uGlow', 'uOpacity',
    'uMouseEnabled', 'uMouseStrength', 'uMouseRadius'
  ];
  for (var n = 0; n < uniformNames.length; n++) {
    u[uniformNames[n]] = gl.getUniformLocation(program, uniformNames[n]);
  }

  // ── Fullscreen triangle geometry (same as OGL Triangle) ──
  var posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  var uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.STATIC_DRAW);

  // ── Color data ──
  var colorData = prepColors(config.colors);
  var flow = flowVec(config.flowDirection);

  // ── Mouse state ──
  var mouseTarget = [0, 0];
  var lastTime = 0;

  function onPointerMove(e) {
    var rect = bg.getBoundingClientRect();
    var dpr = config.dpr;
    var x = (e.clientX - rect.left) * dpr;
    var y = (rect.height - (e.clientY - rect.top)) * dpr;
    mouseTarget = [x, y];
    if (config.mouseDampening <= 0) {
      gl.uniform2fv(u.iMouse, [x, y]);
    }
  }

  if (config.mouseInteraction) {
    bg.addEventListener('pointermove', onPointerMove);
  }

  // ── Resize ──
  function resize() {
    var rect = bg.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    if (w === 0 || h === 0) return;
    var dpr = config.dpr;
    var cw = Math.round(w * dpr);
    var ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      gl.viewport(0, 0, cw, ch);
    }
  }

  resize();
  var ro = new ResizeObserver(resize);
  ro.observe(bg);

  // ── Render ──
  var raf;
  var currentMouse = [0, 0];

  function render(time) {
    raf = requestAnimationFrame(render);

    if (config.paused) return;

    resize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // UV attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    // Resolution
    gl.uniform3f(u.iResolution, gl.drawingBufferWidth, gl.drawingBufferHeight, 1);

    // Time
    gl.uniform1f(u.iTime, time * 0.001);

    // Mouse with dampening
    if (config.mouseDampening > 0) {
      if (!lastTime) lastTime = time;
      var dt = (time - lastTime) / 1000;
      lastTime = time;
      var tau = Math.max(1e-4, config.mouseDampening);
      var factor = 1 - Math.exp(-dt / tau);
      if (factor > 1) factor = 1;
      currentMouse[0] += (mouseTarget[0] - currentMouse[0]) * factor;
      currentMouse[1] += (mouseTarget[1] - currentMouse[1]) * factor;
    } else {
      lastTime = time;
      currentMouse[0] = mouseTarget[0];
      currentMouse[1] = mouseTarget[1];
    }
    gl.uniform2fv(u.iMouse, currentMouse);

    // Colors
    gl.uniform3fv(u.uColor0, colorData.arr[0]);
    gl.uniform3fv(u.uColor1, colorData.arr[1]);
    gl.uniform3fv(u.uColor2, colorData.arr[2]);
    gl.uniform3fv(u.uColor3, colorData.arr[3]);
    gl.uniform3fv(u.uColor4, colorData.arr[4]);
    gl.uniform3fv(u.uColor5, colorData.arr[5]);
    gl.uniform3fv(u.uColor6, colorData.arr[6]);
    gl.uniform3fv(u.uColor7, colorData.arr[7]);
    gl.uniform1f(u.uColorCount, colorData.count);

    gl.uniform3fv(u.uMouseColor, colorData.avg);
    gl.uniform2fv(u.uFlow, flow);
    gl.uniform1f(u.uSpeed, config.speed);
    gl.uniform1f(u.uScale, config.scale);
    gl.uniform1f(u.uTurbulence, config.turbulence);
    gl.uniform1f(u.uFluidity, config.fluidity);
    gl.uniform1f(u.uRimWidth, config.rimWidth);
    gl.uniform1f(u.uSharpness, config.sharpness);
    gl.uniform1f(u.uShimmer, config.shimmer);
    gl.uniform1f(u.uGlow, config.glow);
    gl.uniform1f(u.uOpacity, config.opacity);
    gl.uniform1f(u.uMouseEnabled, config.mouseInteraction ? 1 : 0);
    gl.uniform1f(u.uMouseStrength, config.mouseStrength);
    gl.uniform1f(u.uMouseRadius, config.mouseRadius);

    // Draw fullscreen triangle
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── Public API — set colors (called by carousel) ──
  window._ferrofluidSetColors = function (newColors) {
    if (!newColors || !newColors.length) return;
    colorData = prepColors(newColors);
    flow = flowVec(config.flowDirection);
  };

  window._ferrofluidSetProps = function (props) {
    if (!props) return;
    if (props.colors != null) { colorData = prepColors(props.colors); }
    if (props.speed != null) config.speed = props.speed;
    if (props.scale != null) config.scale = props.scale;
    if (props.turbulence != null) config.turbulence = props.turbulence;
    if (props.fluidity != null) config.fluidity = props.fluidity;
    if (props.rimWidth != null) config.rimWidth = props.rimWidth;
    if (props.sharpness != null) config.sharpness = props.sharpness;
    if (props.shimmer != null) config.shimmer = props.shimmer;
    if (props.glow != null) config.glow = props.glow;
    if (props.flowDirection != null) { config.flowDirection = props.flowDirection; flow = flowVec(props.flowDirection); }
    if (props.opacity != null) config.opacity = props.opacity;
    if (props.mouseInteraction != null) {
      config.mouseInteraction = props.mouseInteraction;
      if (props.mouseInteraction) {
        bg.addEventListener('pointermove', onPointerMove);
      } else {
        bg.removeEventListener('pointermove', onPointerMove);
      }
    }
    if (props.mouseStrength != null) config.mouseStrength = props.mouseStrength;
    if (props.mouseRadius != null) config.mouseRadius = props.mouseRadius;
    if (props.mouseDampening != null) config.mouseDampening = props.mouseDampening;
    if (props.paused != null) config.paused = props.paused;
  };

  // ── Reduced motion ──
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resize();
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(u.iResolution, gl.drawingBufferWidth, gl.drawingBufferHeight, 1);
    gl.uniform1f(u.iTime, 0);
    gl.uniform2fv(u.iMouse, [0, 0]);
    gl.uniform3fv(u.uColor0, colorData.arr[0]);
    gl.uniform3fv(u.uColor1, colorData.arr[1]);
    gl.uniform3fv(u.uColor2, colorData.arr[2]);
    gl.uniform3fv(u.uColor3, colorData.arr[3]);
    gl.uniform3fv(u.uColor4, colorData.arr[4]);
    gl.uniform3fv(u.uColor5, colorData.arr[5]);
    gl.uniform3fv(u.uColor6, colorData.arr[6]);
    gl.uniform3fv(u.uColor7, colorData.arr[7]);
    gl.uniform1f(u.uColorCount, colorData.count);
    gl.uniform3fv(u.uMouseColor, colorData.avg);
    gl.uniform2fv(u.uFlow, flow);
    gl.uniform1f(u.uSpeed, 0);
    gl.uniform1f(u.uScale, config.scale);
    gl.uniform1f(u.uTurbulence, config.turbulence);
    gl.uniform1f(u.uFluidity, config.fluidity);
    gl.uniform1f(u.uRimWidth, config.rimWidth);
    gl.uniform1f(u.uSharpness, config.sharpness);
    gl.uniform1f(u.uShimmer, config.shimmer);
    gl.uniform1f(u.uGlow, config.glow);
    gl.uniform1f(u.uOpacity, config.opacity);
    gl.uniform1f(u.uMouseEnabled, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return;
  }

  // ── Pause WebGL when hero is off-screen ──
  var viewObserver = new IntersectionObserver(function(entries) {
    config.paused = !entries[0].isIntersecting;
  }, { threshold: 0 });
  viewObserver.observe(hero);

  // ── Start render loop ──
  raf = requestAnimationFrame(render);

  // ── Cleanup on unload ──
  window.addEventListener('beforeunload', function () {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    bg.removeEventListener('pointermove', onPointerMove);
    if (canvas.parentElement === bg) bg.removeChild(canvas);
  });
})();
