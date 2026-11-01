/* Throttle "Living light": a long-exposure light field.
   Streams of requests drift right toward OpenAI / Anthropic (brick). Some get pulled off,
   warm to gold and arc home into a target (the savings counter, or a button).
   CPU-steered particles, drawn as additive line segments into a fading float buffer,
   then composited with a soft mip-chain bloom. One instance per canvas.

   LightField(opts) -> { layout(), setActive(bool), setScroll(p), still() }
   opts: canvas, stage, reduce, count:[desktop, mobile],
         targets(W, H, mobile) -> { home:{x0,x1,y}, rent:{x,y,spread}, emit:{y0,y1}, capx?:[...] }
         share(t, scroll, mobile) -> fraction of streams pulled home
         onFrame(t)  (optional, e.g. the counter)
         pulseGain, homeGlow, rentGlow (optional look tweaks) */
(function () {
  "use strict";
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  function LightField(o) {
    var canvas = o.canvas, stage = o.stage, reduce = !!o.reduce;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return null;
    var hasFloat = !!gl.getExtension("EXT_color_buffer_float");

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }

    var lineP = prog("#version 300 es\n" +
      "in vec2 aPos; in vec4 aCol; uniform vec2 uSize; out vec4 vCol;\n" +
      "void main(){ vec2 c = aPos / uSize * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0., 1.); vCol = aCol; }",
      "#version 300 es\nprecision highp float; in vec4 vCol; out vec4 o; void main(){ o = vCol; }");

    var quadVS = "#version 300 es\nin vec2 aPos; out vec2 vUv; void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }";
    var fadeP = prog(quadVS, "#version 300 es\nprecision highp float; uniform float uF; out vec4 o; void main(){ o = vec4(uF); }");
    var subP = prog(quadVS, "#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(1.5/255.); }");
    var compP = prog(quadVS, "#version 300 es\n" +
      "precision highp float;\n" +
      "in vec2 vUv; out vec4 o;\n" +
      "uniform sampler2D uTrail; uniform float uTime, uPulse, uW, uAspect, uHomeW, uHomeG, uRentG;\n" +
      "uniform vec2 uHome, uRent;\n" +
      "float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }\n" +
      "float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);\n" +
      "  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }\n" +
      "float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }\n" +
      "void main(){\n" +
      "  vec2 uv = vUv; vec2 p = vec2(uv.x*uAspect, uv.y);\n" +
      "  vec3 top = vec3(0.043,0.082,0.196), bot = vec3(0.027,0.051,0.133);\n" +
      "  vec3 col = mix(bot, top, smoothstep(0.,1.,uv.y));\n" +
      "  vec2 q = p*1.6 + vec2(uTime*.012, -uTime*.008);\n" +
      "  float n = fbm(q + fbm(q*1.3 + uTime*.02)*1.4);\n" +
      "  col += vec3(0.05,0.075,0.16) * smoothstep(.35,.95,n) * .55;\n" +
      "  vec2 hp = vec2(uHome.x*uAspect, uHome.y);\n" +
      "  vec2 d = (p - hp) / vec2(uHomeW*uAspect*.9 + .12, .16);\n" +
      "  float g = exp(-dot(d,d)*1.4);\n" +
      "  col += vec3(0.85,0.62,0.30) * g * (0.07 + 0.18*uW + 0.05*uPulse) * uHomeG;\n" +
      "  vec2 rp = vec2(uRent.x*uAspect, uRent.y);\n" +
      "  float r = length(p - rp);\n" +
      "  col += vec3(0.62,0.26,0.15) * exp(-r*r*7.) * (0.22 - 0.12*uW) * uRentG;\n" +
      "  vec3 t = textureLod(uTrail, uv, 0.).rgb;\n" +
      "  vec3 bl = textureLod(uTrail, uv, 2.5).rgb*.9 + textureLod(uTrail, uv, 4.).rgb*1.3 + textureLod(uTrail, uv, 5.5).rgb*1.6;\n" +
      "  vec3 lit = t*1.1 + bl*.55;\n" +
      "  col += 1.0 - exp(-lit);\n" +
      "  float v = smoothstep(1.25, .25, length((uv-.5)*vec2(1.0,1.15)));\n" +
      "  col *= mix(.72, 1., v);\n" +
      "  col += (hash(gl_FragCoord.xy + fract(uTime)*91.) - .5) * .028;\n" +
      "  o = vec4(col, 1.);\n" +
      "}");

    var quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var W = 0, H = 0, DPR = 1, mobile = false;
    var home = { x0: 0, x1: 0, y: 0 }, rent = { x: 0, y: 0, spread: 0 }, emit = { y0: 0, y1: 0 };
    var N = 0, P, verts, lineVAO, lineBuf = gl.createBuffer();
    var LANES = [0.0, 0.12, 0.22, 0.36, 0.47, 0.58, 0.71, 0.83, 0.95];
    var CAPX = [0.52, 0.30, 0.61, 0.24, 0.44, 0.36, 0.56, 0.28, 0.47];
    var HOMEX = [0.10, 0.85, 0.30, 0.65, 0.20, 0.50, 0.92, 0.40, 0.75];
    var capx = CAPX;

    function alloc(n) {
      N = n;
      P = { x: new Float32Array(n), y: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n),
            vx: new Float32Array(n), vy: new Float32Array(n), b: new Float32Array(n), cap: new Uint8Array(n),
            chk: new Uint8Array(n), hx: new Float32Array(n), wait: new Float32Array(n), capX: new Float32Array(n),
            s: new Float32Array(n), lane: new Float32Array(n), age: new Float32Array(n) };
      verts = new Float32Array(n * 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
      lineVAO = gl.createVertexArray(); gl.bindVertexArray(lineVAO);
      var aC = gl.getAttribLocation(lineP, "aCol");
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
    }
    function spawn(i, anywhere) {
      var li = (Math.random() * LANES.length) | 0, lane = LANES[li];
      var y = emit.y0 + (emit.y1 - emit.y0) * lane + (Math.random() + Math.random() - 1) * (mobile ? 14 : 30);
      P.x[i] = -30 - Math.random() * 40; P.y[i] = y; P.px[i] = P.x[i]; P.py[i] = y;
      P.vx[i] = 1; P.vy[i] = 0; P.b[i] = 0; P.cap[i] = 0; P.chk[i] = 0; P.age[i] = 0;
      P.s[i] = Math.random(); P.lane[i] = lane;
      P.capX[i] = W * (capx[li] + (Math.random() - 0.5) * 0.035);
      P.hx[i] = HOMEX[li] + (Math.random() - 0.5) * 0.08;
      P.wait[i] = anywhere ? Math.random() * 520 : 0;
    }

    var fbA, texA, fw = 0, fh = 0;
    function makeTarget(w, h) {
      if (texA) { gl.deleteTexture(texA); gl.deleteFramebuffer(fbA); }
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, hasFloat ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      fbA = fb; texA = tex;
    }

    function field(x, y, t) {
      return 1.9 * Math.sin(x * 0.0019 + t * 0.06 + 1.3) + 1.5 * Math.cos(y * 0.0031 - t * 0.045)
           + 1.1 * Math.sin((x - y) * 0.0012 + t * 0.03) + 0.6 * Math.sin(x * 0.006 + y * 0.004 + t * 0.08);
    }

    var wHome = 0, pulse = 0, simT = 0, scrollP = 0;
    function homeX(i) { return home.x0 + (home.x1 - home.x0) * P.hx[i]; }
    function step(dt) {
      simT += dt / 60;
      var sc = clamp(W / 1440, 0.55, 1.3);
      var speed = (mobile ? 1.6 : 2.1) * sc;
      for (var i = 0; i < N; i++) {
        if (P.wait[i] > 0) { P.wait[i] -= dt; continue; }
        var x = P.x[i], y = P.y[i];
        P.px[i] = x; P.py[i] = y;
        if (!P.cap[i] && !P.chk[i] && x > P.capX[i]) { P.chk[i] = 1; if (Math.random() < wHome) P.cap[i] = 1; }
        var tx, ty;
        var rx = rent.x, ry = rent.y + (P.lane[i] - 0.35) * rent.spread;
        var hx = homeX(i), hy = home.y;
        if (P.cap[i]) {
          // pulled, not teleported: the pull toward home grows as the stream warms to gold
          P.b[i] = Math.min(1, P.b[i] + 0.0105 * dt);
          var m = P.b[i] * P.b[i] * (3 - 2 * P.b[i]), k1 = Math.min(1, m * 1.6);
          tx = rx + (hx - rx) * k1; ty = ry + (hy - ry) * k1;
          if (m > 0.62) { tx = hx; ty = hy; }
        } else { tx = rx; ty = ry; }
        var dx = tx - x, dy = ty - y, dist = Math.sqrt(dx * dx + dy * dy) + 1e-4; dx /= dist; dy /= dist;
        var a = field(x, y, simT);
        var wander = P.cap[i] ? 0.4 * clamp(dist / 300, 0, 1) : 0.5;
        var ddx = dx + Math.cos(a) * wander, ddy = dy + Math.sin(a) * wander;
        var dl = Math.sqrt(ddx * ddx + ddy * ddy) + 1e-4, sp = speed * (0.9 + 0.2 * P.s[i]) * (P.cap[i] ? 1.08 : 1);
        var k = (P.cap[i] ? 0.026 + 0.04 * clamp(1 - dist / (mobile ? 200 : 400), 0, 1) : 0.03) * dt;
        P.vx[i] += (ddx / dl * sp - P.vx[i]) * k; P.vy[i] += (ddy / dl * sp - P.vy[i]) * k;
        x += P.vx[i] * dt; y += P.vy[i] * dt; P.x[i] = x; P.y[i] = y; P.age[i] += dt;
        if (P.cap[i] && P.b[i] > 0.5 && Math.abs(x - hx) < 16 && Math.abs(y - hy) < 16) { pulse = Math.min(1, pulse + 0.02); spawn(i, false); continue; }
        if (x > W + 60 || y < -80 || y > H + 80 || P.age[i] > 2600) spawn(i, false);
      }
      pulse *= Math.pow(0.97, dt);
    }

    var BR = [0.78, 0.34, 0.20], GO = [0.92, 0.66, 0.30], GL = [0.98, 0.80, 0.46];
    var gain = o.gain || 1, gainM = o.gainM || gain;
    function writeVerts() {
      var base = mobile ? 0.15 * gainM : 0.085 * gain;
      for (var i = 0; i < N; i++) {
        var b = P.b[i], off = i * 12;
        var r = BR[0] + (GO[0] - BR[0]) * b, g = BR[1] + (GO[1] - BR[1]) * b, bl = BR[2] + (GO[2] - BR[2]) * b;
        var a = base * (P.cap[i] ? (1.3 + 1.2 * b + 2.2 * Math.max(0, 1 - Math.abs(b - 0.22) * 5)) : clamp(1.2 - P.x[i] / W * 0.95, 0.22, 1.05));
        a *= clamp(P.age[i] / 40, 0, 1) * (P.wait[i] > 0 ? 0 : 1);
        if (P.cap[i] && b > 0.9) { r = GL[0]; g = GL[1]; bl = GL[2]; }
        verts[off] = P.px[i]; verts[off + 1] = P.py[i]; verts[off + 2] = r; verts[off + 3] = g; verts[off + 4] = bl; verts[off + 5] = a * 0.35;
        verts[off + 6] = P.x[i]; verts[off + 7] = P.y[i]; verts[off + 8] = r; verts[off + 9] = g; verts[off + 10] = bl; verts[off + 11] = a;
      }
    }

    var uF = gl.getUniformLocation(fadeP, "uF"), uSize = gl.getUniformLocation(lineP, "uSize");
    function drawTrails(dt) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbA); gl.viewport(0, 0, fw, fh);
      gl.enable(gl.BLEND);
      gl.useProgram(fadeP); gl.uniform1f(uF, Math.pow(mobile ? (o.fadeM || 0.965) : 0.972, dt));
      gl.blendFunc(gl.ZERO, gl.SRC_ALPHA); gl.bindVertexArray(quadVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!hasFloat) { gl.useProgram(subP); gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT); gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.blendEquation(gl.FUNC_ADD); }
      writeVerts();
      gl.useProgram(lineP); gl.uniform2f(uSize, W, H);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindVertexArray(lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
      gl.drawArrays(gl.LINES, 0, N * 2);
      gl.disable(gl.BLEND);
    }

    var U = function (n) { return gl.getUniformLocation(compP, n); };
    var uL = { trail: U("uTrail"), time: U("uTime"), pulse: U("uPulse"), w: U("uW"), aspect: U("uAspect"),
               home: U("uHome"), rent: U("uRent"), homeW: U("uHomeW"), homeG: U("uHomeG"), rentG: U("uRentG") };
    function composite(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA); gl.generateMipmap(gl.TEXTURE_2D); gl.uniform1i(uL.trail, 0);
      gl.uniform1f(uL.time, t); gl.uniform1f(uL.pulse, pulse); gl.uniform1f(uL.w, wHome); gl.uniform1f(uL.aspect, W / H);
      gl.uniform2f(uL.home, ((home.x0 + home.x1) / 2) / W, 1 - home.y / H);
      gl.uniform2f(uL.rent, Math.min(rent.x, W) / W, 1 - rent.y / H);
      gl.uniform1f(uL.homeW, (home.x1 - home.x0) / W * 0.5);
      gl.uniform1f(uL.homeG, o.homeGlow == null ? 1 : o.homeGlow);
      gl.uniform1f(uL.rentG, o.rentGlow == null ? 1 : o.rentGlow);
      gl.bindVertexArray(quadVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    var t0 = 0, last = 0, raf = 0, active = false, started = false, lastW = 0, lastH = 0;
    function prewarm(steps) {
      var keep = wHome;
      wHome = o.share(reduce ? 99 : 0, scrollP, mobile);
      if (reduce) wHome = Math.max(wHome, o.stillShare || 0.6);
      for (var k = 0; k < steps; k++) { step(1); if (k > steps - 40) drawTrails(1); }
      if (!reduce) wHome = keep;
    }
    function layout(force) {
      var r = stage.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (!force && w === lastW && Math.abs(h - lastH) < 120) return;
      lastW = w; lastH = h;
      W = w; H = h; mobile = W < 760;
      DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      if (fw !== canvas.width || fh !== canvas.height) { fw = canvas.width; fh = canvas.height; makeTarget(fw, fh); }
      var tg = o.targets(W, H, mobile);
      home = tg.home; rent = tg.rent; emit = tg.emit; capx = tg.capx || CAPX;
      canvas.style.transform = tg.mirror ? "scaleX(-1)" : "";
      var want = mobile ? o.count[1] : o.count[0];
      if (N !== want) alloc(want);
      for (var i = 0; i < N; i++) spawn(i, true);
      prewarm(reduce ? 900 : (o.prewarm || 520));
      if (reduce || !active) composite(reduce ? 4 : (last ? (last - t0) / 1000 : 0));
    }
    function retarget() {
      // targets moved (e.g. fonts loaded) without a size change: keep the particles, move the goal
      var tg = o.targets(W, H, mobile); home = tg.home; rent = tg.rent; emit = tg.emit;
    }
    function frame(now) {
      raf = 0;
      if (!active || document.hidden) return;
      var dt = clamp((now - last) / (1000 / 60), 0.25, 3); last = now;
      var t = (now - t0) / 1000;
      wHome = o.share(t, scrollP, mobile);
      step(dt); drawTrails(dt); composite(t);
      if (o.onFrame) o.onFrame(t);
      raf = requestAnimationFrame(frame);
    }
    function setActive(on) {
      if (reduce) return;
      active = !!on;
      if (active && !raf && !document.hidden) {
        var now = performance.now();
        if (!started) { started = true; t0 = now; }
        else t0 += now - last;            // resume where we paused, no jump in the timeline
        last = now; raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden && active && !raf) { var n = performance.now(); t0 += n - last; last = n; raf = requestAnimationFrame(frame); } });

    layout(true);
    return {
      layout: layout, retarget: retarget, setActive: setActive,
      setScroll: function (p) { scrollP = p; },
      elapsed: function () { return started ? (last - t0) / 1000 : 0; }
    };
  }
  window.LightField = LightField;
})();
