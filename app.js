/* Lun landing — language toggle + copy buttons */
(function () {
  "use strict";

  /* ---------- language ---------- */
  var STORAGE_KEY = "lun-lang";
  var toggle = document.getElementById("langToggle");
  var opts = toggle ? toggle.querySelectorAll(".lang-toggle__opt") : [];

  function applyLang(lang) {
    lang = lang === "kr" ? "kr" : "en";
    document.documentElement.lang = lang === "kr" ? "ko" : "en";
    document.body.setAttribute("data-lang", lang);

    document.querySelectorAll("[data-en]").forEach(function (el) {
      var val = el.getAttribute("data-" + lang);
      if (val == null) return;
      // values may contain inline markup (<strong>, <code>)
      el.innerHTML = val;
    });

    opts.forEach(function (o) {
      o.classList.toggle("is-active", o.getAttribute("data-set") === lang);
    });

    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function initialLang() {
    var url = new URLSearchParams(location.search).get("lang");
    if (url === "kr" || url === "ko") return "kr";
    if (url === "en") return "en";
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "kr" || saved === "en") return saved;
    } catch (e) {}
    // default to English
    return "en";
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = document.body.getAttribute("data-lang");
      applyLang(current === "kr" ? "en" : "kr");
    });
  }
  applyLang(initialLang());

  /* ---------- copy ---------- */
  var toast = document.createElement("div");
  toast.className = "toast";
  document.body.appendChild(toast);
  var toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-show"); }, 1600);
  }

  function copyText(text) {
    var lang = document.body.getAttribute("data-lang");
    var ok = lang === "kr" ? "복사됨 ✓" : "Copied ✓";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast(ok); }, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast(ok); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // copybox: text held on the wrapper via data-copy
  document.querySelectorAll(".copybox").forEach(function (box) {
    box.addEventListener("click", function () {
      copyText(box.getAttribute("data-copy") || "");
    });
    box.style.cursor = "pointer";
  });

  // codeblock copy buttons
  document.querySelectorAll(".codeblock__copy").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      copyText(btn.getAttribute("data-copy") || "");
    });
  });
})();
