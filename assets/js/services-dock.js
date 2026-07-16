// ── Services Dock Magnification ──
// macOS-style Dock effect: cards magnify based on mouse proximity
(function() {
  var grids = document.querySelectorAll('.services-grid');
  if (!grids.length) return;

  var DISTANCE = 160;
  var MAGNIFICATION = 1.12;

  grids.forEach(function(grid) {
    var cards = Array.from(grid.querySelectorAll('.service-card'));
    if (!cards.length) return;

    var rafId = null;
    var mouseX = -9999;
    var mouseY = -9999;
    var inside = false;

    grid.addEventListener('mousemove', function(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      inside = true;
      if (!rafId) rafId = requestAnimationFrame(update);
    });

    grid.addEventListener('mouseleave', function() {
      inside = false;
      mouseX = -9999;
      mouseY = -9999;
      if (!rafId) rafId = requestAnimationFrame(update);
    });

    function update() {
      rafId = null;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!inside) {
          card.style.scale = '';
          continue;
        }
        var rect = card.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dist = Math.hypot(mouseX - cx, mouseY - cy);
        var scale;
        if (dist <= DISTANCE) {
          var t = 1 - dist / DISTANCE;
          // easeOutCubic for smoother falloff
          t = 1 - Math.pow(1 - t, 3);
          scale = 1 + (MAGNIFICATION - 1) * t;
        } else {
          scale = 1;
        }
        card.style.scale = scale.toFixed(3);
      }
    }
  });
})();
