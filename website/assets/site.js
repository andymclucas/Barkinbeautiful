// Groomigo site: small progressive touches only. Every page reads and works
// with this file missing or blocked.
(function () {
  var root = document.documentElement;

  // Fade sections in as they scroll into view. Content is visible by default;
  // the hidden starting state only applies once this script has run, and
  // never for people who ask for reduced motion.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
    // Anything already on screen at load shows at once.
    requestAnimationFrame(function () {
      document.querySelectorAll(".reveal").forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add("in");
      });
    });
  }

  // Close the phone menu after a link in it is chosen.
  document.querySelectorAll(".menu-panel a").forEach(function (a) {
    a.addEventListener("click", function () {
      var d = a.closest("details");
      if (d) d.removeAttribute("open");
    });
  });

  // Footer year.
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // The board illustration on the home page: every few seconds one dog moves
  // on a stage, so the page shows what the product does rather than saying it.
  var board = document.querySelector("[data-live-board]");
  if (board && !reduce) {
    var cols = Array.prototype.slice.call(board.querySelectorAll(".col"));
    var colours = ["var(--st-wait)", "var(--st-bath)", "var(--st-dry)", "var(--st-groom)", "var(--st-ready)"];
    var labels = ["Next in", "In the bath", "On the dryer", "On the table", "Ready"];
    setInterval(function () {
      if (document.hidden) return;
      // Move the oldest dog from the busiest non-final column on one stage.
      for (var i = cols.length - 2; i >= 0; i--) {
        var dogs = cols[i].querySelectorAll(".dog");
        if (dogs.length > 1 || (i === 0 && dogs.length)) {
          var dog = dogs[dogs.length - 1];
          var next = cols[i + 1];
          dog.style.setProperty("--c", colours[i + 1]);
          var em = dog.querySelector("em");
          if (em) em.textContent = labels[i + 1];
          var q = dog.querySelector(".q");
          if (q) q.remove();
          dog.animate && dog.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "ease-out" });
          next.insertBefore(dog, next.querySelector(".dog"));
          // Keep the Ready column from growing forever: the first one in goes home.
          var ready = cols[cols.length - 1].querySelectorAll(".dog");
          if (ready.length > 3) {
            var home = ready[ready.length - 1];
            home.style.setProperty("--c", colours[0]);
            var hem = home.querySelector("em"); if (hem) hem.textContent = labels[0];
            cols[0].appendChild(home);
          }
          cols.forEach(function (c) {
            var n = c.querySelectorAll(".dog").length;
            var s = c.querySelector("h5 small"); if (s) s.textContent = String(n);
          });
          break;
        }
      }
    }, 2600);
  }
})();
