/* Rocket launch → orbit transition overlay — runs in the Harness browser context.
   Builds the overlay DOM, plays the launch sequence, then hands over to the app.
   Guarded so it can never block the app: a CSS auto-hide fallback plus a hard
   timeout, and clicking anywhere skips straight to the app. */
(function () {
  if (window.__rocketBootInjected) return;
  window.__rocketBootInjected = true;

  var ROCKET_SVG =
    '<svg class="rb-svg" viewBox="0 0 120 220" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="rbBody" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#16233c"/><stop offset="42%" stop-color="#e6f2ff"/>' +
    '<stop offset="72%" stop-color="#8fa9c9"/><stop offset="100%" stop-color="#26364f"/></linearGradient>' +
    '<linearGradient id="rbNose" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#7ef9ff"/><stop offset="100%" stop-color="#00a3c9"/></linearGradient>' +
    '<linearGradient id="rbFin" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#ff2d95"/><stop offset="100%" stop-color="#7c4dff"/></linearGradient>' +
    '</defs>' +
    '<path d="M60 6 C84 40 92 78 92 116 L92 152 L28 152 L28 116 C28 78 36 40 60 6 Z" fill="url(#rbBody)"/>' +
    '<path d="M60 6 C75 25 83 46 87 68 L60 80 L33 68 C37 46 45 25 60 6 Z" fill="url(#rbNose)"/>' +
    '<path d="M28 114 L6 168 L28 158 Z" fill="url(#rbFin)"/>' +
    '<path d="M92 114 L114 168 L92 158 Z" fill="url(#rbFin)"/>' +
    '<rect x="28" y="118" width="64" height="7" fill="#00e5ff" opacity=".55"/>' +
    '<circle cx="60" cy="100" r="14" fill="#04121b" stroke="#00e5ff" stroke-width="3"/>' +
    '<circle cx="60" cy="100" r="7" fill="#00e5ff" opacity=".55"/>' +
    '<path d="M42 152 L78 152 L71 170 L49 170 Z" fill="#1b2740" stroke="#00e5ff" stroke-width="1.5" opacity=".9"/>' +
    '</svg>';

  function build() {
    var root = document.createElement('div');
    root.id = 'rocket-boot';
    root.className = 'rb-auto';
    root.setAttribute('data-phase', 'pad');
    root.setAttribute('data-t0', String(performance.now()));
    root.innerHTML =
      '<div class="rb-space"></div>' +
      '<div class="rb-stars"></div>' +
      '<div class="rb-planet"></div>' +
      '<div class="rb-sky"></div>' +
      '<div class="rb-horizon"></div>' +
      '<div class="rb-grid"></div>' +
      '<div class="rb-speed"></div>' +
      '<div class="rb-smoke"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="rb-pad"><div class="rb-tower"></div></div>' +
      '<div class="rb-rocket">' + ROCKET_SVG +
        '<div class="rb-flame"></div><div class="rb-trail"></div></div>' +
      '<div class="rb-hud">' +
        '<div class="rb-top"><span>DEEPSEEK HARNESS // ORBITAL LAUNCH</span>' +
          '<span class="rb-blink">● LIVE</span><span class="rb-clock" id="rb-clock">--:--:--</span></div>' +
        '<div class="rb-count" id="rb-count"></div>' +
        '<div class="rb-telemetry">' +
          '<div>ALT <b id="rb-alt">0.0</b> km</div>' +
          '<div>VEL <b id="rb-vel">0</b> m/s</div>' +
          '<div>STAGE <b id="rb-stage">PRELAUNCH</b></div></div>' +
        '<div class="rb-log" id="rb-log"></div>' +
        '<div class="rb-title" id="rb-title"><b>进入界面</b><span>TRANSIT COMPLETE</span></div>' +
        '<div class="rb-corner tl"></div><div class="rb-corner tr"></div>' +
        '<div class="rb-corner bl"></div><div class="rb-corner br"></div>' +
      '</div>' +
      '<div class="rb-flash"></div>' +
      '<div class="rb-vignette"></div><div class="rb-scan"></div>' +
      '<div class="rb-skip">点击任意处跳过 ▸</div>';
    (document.body || document.documentElement).appendChild(root);

    var count = document.getElementById('rb-count');
    var log = document.getElementById('rb-log');
    var alt = document.getElementById('rb-alt');
    var vel = document.getElementById('rb-vel');
    var stage = document.getElementById('rb-stage');
    var clock = document.getElementById('rb-clock');
    var timers = [];
    var done = false;

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearAll() { timers.forEach(clearTimeout); timers = []; }

    function writeClock() {
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    writeClock();
    var clk = setInterval(writeClock, 1000);

    function line(text, cls) {
      var div = document.createElement('div');
      if (cls) div.className = cls;
      div.textContent = text;
      log.appendChild(div);
    }

    function setPhase(name) { root.setAttribute('data-phase', name); }

    function dismiss() {
      if (done) return;
      done = true;
      clearAll();
      clearInterval(clk);
      root.classList.add('rb-hide');
      setTimeout(function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }, 800);
    }

    function skipToEnd() {
      clearAll();
      setPhase('orbit');
      setTimeout(function () {
        var title = document.getElementById('rb-title');
        if (title) title.classList.add('rb-show');
        setTimeout(dismiss, 700);
      }, 260);
    }

    // --- sequence ----------------------------------------------------------
    // The CSS timeline (rb-flight) runs 6s; the timers below stay in step with it.
    later(function () {
      count.textContent = 'T-3';
      count.classList.add('rb-show');
      line('[CTRL] 发射控制台已接管 ...', 'rb-ok');
    }, 60);
    later(function () { count.textContent = 'T-2'; line('轨道校准完成 · ALIGNMENT OK'); }, 320);
    later(function () { count.textContent = 'T-1'; line('推进剂加压 100% · PRESSURIZED'); }, 580);
    later(function () {
      count.textContent = 'T-0';
      setPhase('ignite');
      root.classList.add('rb-boom');
      line('点火许可 GRANTED · IGNITION', 'rb-hi');
    }, 840);
    later(function () {
      count.textContent = '';
      count.classList.remove('rb-show');
      setPhase('ascent');
      line('离地 LIFTOFF', 'rb-hi');
    }, 1420);
    later(function () { stage.textContent = 'ASCENT'; line('通过音速 · MAX Q'); }, 2100);
    later(function () { stage.textContent = 'STAGE SEP'; line('一级分离 · STAGE SEP'); }, 2900);
    later(function () { stage.textContent = 'ORBIT'; line('轨道参数确认 · ORBIT NOMINAL', 'rb-ok'); }, 3600);
    later(function () {
      setPhase('orbit');
      line('穿越大气层 · ATMOSPHERE EXIT', 'rb-hi');
    }, 4000);
    later(function () { line('舷窗外星空展开 · STARFIELD', 'rb-ok'); }, 4700);
    later(function () { line('轨道插入完成 · DOCKED'); }, 5400);
    later(function () {
      var title = document.getElementById('rb-title');
      if (title) title.classList.add('rb-show');
      root.classList.add('rb-boom');
    }, 6000);
    later(dismiss, 6750);

    // --- telemetry ---------------------------------------------------------
    var start = Date.now();
    var tick = setInterval(function () {
      var t = (Date.now() - start) / 1000;
      var a, v;
      if (t < 1.4) { a = 0; v = 0; }
      else if (t < 4) { var k = (t - 1.4) / 2.6; a = 220 * k * k; v = 3400 * k * k; }
      else if (t < 6) { var k2 = (t - 4) / 2; a = 220 + 1980 * k2; v = 3400 + 2600 * k2; }
      else { a = 2200; v = 6000; }
      alt.textContent = a.toFixed(1);
      vel.textContent = String(Math.round(v));
    }, 80);
    timers.push(setTimeout(function () { clearInterval(tick); }, 6700));

    // --- controls ----------------------------------------------------------
    root.addEventListener('click', skipToEnd);
    document.addEventListener('keydown', skipToEnd, { once: true });
    // Hard safety: never block the app longer than 14s.
    setTimeout(dismiss, 14000);
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
