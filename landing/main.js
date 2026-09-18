/*
 * PSflix landing page enhancements. Everything here is optional: without this
 * file the page renders and reads completely (see index.html / styles.css).
 * Each feature is gated behind its own detection and respects
 * prefers-reduced-motion.
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile navigation toggle ---------- */

  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');

  if (toggle && links) {
    var closeNav = function () {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    // Close after choosing a destination (mobile menu stays otherwise open).
    links.addEventListener('click', function (event) {
      if (event.target instanceof Element && event.target.closest('a')) closeNav();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && links.classList.contains('open')) {
        closeNav();
        toggle.focus();
      }
    });
  }

  /* ---------- Scroll reveal (IntersectionObserver) ---------- */

  var revealables = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (revealables.length && 'IntersectionObserver' in window && !reducedMotion) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    revealables.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealables.forEach(function (el) {
      el.classList.add('revealed');
    });
  }

  /* ---------- Lightbox (click-to-zoom on framed screenshots) ---------- */

  var triggers = Array.prototype.slice.call(
    document.querySelectorAll('[data-lightbox]'),
  );

  if (!triggers.length) return;

  var lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Screenshot full-size view');
  lightbox.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="Close full-size view">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"' +
    ' stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<img src="" alt="" />' +
    '<p class="lightbox-caption"></p>';
  document.body.appendChild(lightbox);

  var lightboxImg = lightbox.querySelector('img');
  var lightboxCaption = lightbox.querySelector('.lightbox-caption');
  var lightboxClose = lightbox.querySelector('.lightbox-close');
  var lastTrigger = null;

  var openLightbox = function (trigger) {
    var img = trigger.querySelector('img');
    if (!img) return;
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt;
    lightboxCaption.textContent = img.alt;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lastTrigger = trigger;
    lightboxClose.focus();
  };

  var closeLightbox = function () {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lightboxImg.src = '';
    if (lastTrigger) lastTrigger.focus();
    lastTrigger = null;
  };

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      openLightbox(trigger);
    });
    trigger.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox(trigger);
      }
    });
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
  });
})();
