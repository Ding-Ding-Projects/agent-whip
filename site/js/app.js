// agent-whip site — shared app shell behaviour. Zero dependencies, local storage only.
(function () {
  "use strict";

  var LS = window.localStorage;
  function get(key, fallback) {
    try {
      var v = LS.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { LS.setItem(key, value); } catch (e) { /* storage unavailable: degrade to defaults */ }
  }

  // ---------------- Theme ----------------
  var Theme = {
    apply: function () {
      var mode = get("aw.theme", "system");
      var root = document.documentElement;
      if (mode === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", mode);
      Theme.applyAccentAndDensity();
    },
    set: function (mode) { set("aw.theme", mode); Theme.apply(); },
    get: function () { return get("aw.theme", "system"); },
    applyAccentAndDensity: function () {
      var density = get("aw.density", "1");
      document.documentElement.style.setProperty("--density", density);
      var h = get("aw.accent.h", null);
      var s = get("aw.accent.s", null);
      var l = get("aw.accent.l", null);
      if (h !== null && s !== null && l !== null) {
        document.documentElement.style.setProperty("--md-sys-color-primary", "hsl(" + h + " " + s + "% " + l + "%)");
      }
    }
  };
  Theme.apply();

  // ---------------- Tab strip docking ----------------
  var TabDock = {
    edges: ["left", "top", "right", "bottom"],
    init: function () {
      var shell = document.querySelector(".app-shell");
      if (!shell) return;
      var dock = get("aw.dock", "left");
      shell.setAttribute("data-dock", dock);
      TabDock.updateOrientation(shell, dock);

      var controls = document.querySelectorAll("[data-dock-btn]");
      controls.forEach(function (btn) {
        var edge = btn.getAttribute("data-dock-btn");
        btn.setAttribute("aria-pressed", String(edge === dock));
        btn.addEventListener("click", function () {
          set("aw.dock", edge);
          shell.setAttribute("data-dock", edge);
          TabDock.updateOrientation(shell, edge);
          controls.forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-dock-btn") === edge));
          });
        });
      });

      TabDock.wireKeyboardRoving();
    },
    updateOrientation: function (shell, dock) {
      var strip = shell.querySelector(".tab-strip[role='tablist']");
      if (!strip) return;
      var vertical = dock === "left" || dock === "right";
      strip.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal");
    },
    wireKeyboardRoving: function () {
      var strip = document.querySelector(".tab-strip[role='tablist']");
      if (!strip) return;
      var tabs = Array.prototype.slice.call(strip.querySelectorAll('[role="tab"]'));
      if (!tabs.length) return;
      strip.addEventListener("keydown", function (e) {
        var vertical = strip.getAttribute("aria-orientation") === "vertical";
        var nextKey = vertical ? "ArrowDown" : "ArrowRight";
        var prevKey = vertical ? "ArrowUp" : "ArrowLeft";
        var idx = tabs.indexOf(document.activeElement);
        if (idx === -1) return;
        if (e.key === nextKey) {
          e.preventDefault();
          tabs[(idx + 1) % tabs.length].focus();
        } else if (e.key === prevKey) {
          e.preventDefault();
          tabs[(idx - 1 + tabs.length) % tabs.length].focus();
        } else if (e.key === "Home") {
          e.preventDefault(); tabs[0].focus();
        } else if (e.key === "End") {
          e.preventDefault(); tabs[tabs.length - 1].focus();
        }
      });
    }
  };

  // ---------------- Notifications (non-blocking toasts + history) ----------------
  var Notify = {
    history: [],
    init: function () {
      if (!document.querySelector(".toast-region")) {
        var region = document.createElement("div");
        region.className = "toast-region";
        region.setAttribute("aria-live", "polite");
        region.setAttribute("role", "status");
        document.body.appendChild(region);
      }
      Notify.loadHistory();
      Notify.buildHistoryUI();
    },
    loadHistory: function () {
      try { Notify.history = JSON.parse(get("aw.notif.history", "[]")); } catch (e) { Notify.history = []; }
    },
    saveHistory: function () {
      set("aw.notif.history", JSON.stringify(Notify.history.slice(-30)));
    },
    show: function (message, kind) {
      kind = kind || "info";
      var region = document.querySelector(".toast-region");
      if (!region) return;
      var toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      var text = document.createElement("span");
      text.textContent = message;
      var dismiss = document.createElement("button");
      dismiss.className = "dismiss";
      dismiss.setAttribute("aria-label", "Dismiss notification");
      dismiss.textContent = "×";
      dismiss.addEventListener("click", function () { toast.remove(); });
      toast.appendChild(text);
      toast.appendChild(dismiss);
      region.appendChild(toast);
      var timeout = kind === "error" || kind === "warning" ? null : 5000;
      if (timeout) setTimeout(function () { if (toast.parentNode) toast.remove(); }, timeout);

      Notify.history.push({ message: message, kind: kind, at: new Date().toISOString() });
      Notify.saveHistory();
      Notify.renderHistoryList();
    },
    buildHistoryUI: function () {
      if (document.querySelector(".notif-history-btn")) return;
      var btn = document.createElement("button");
      btn.className = "icon-btn notif-history-btn";
      btn.setAttribute("aria-label", "Notification history");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "🔔";
      var panel = document.createElement("div");
      panel.className = "history-panel";
      panel.setAttribute("role", "log");
      panel.setAttribute("aria-label", "Notification history");
      btn.addEventListener("click", function () {
        var open = panel.getAttribute("data-open") === "true";
        panel.setAttribute("data-open", String(!open));
        btn.setAttribute("aria-expanded", String(!open));
      });
      document.body.appendChild(btn);
      document.body.appendChild(panel);
      Notify.renderHistoryList();
    },
    renderHistoryList: function () {
      var panel = document.querySelector(".history-panel");
      if (!panel) return;
      panel.innerHTML = "";
      if (!Notify.history.length) {
        var empty = document.createElement("div");
        empty.className = "entry";
        empty.textContent = "No notifications yet.";
        panel.appendChild(empty);
        return;
      }
      Notify.history.slice().reverse().forEach(function (n) {
        var row = document.createElement("div");
        row.className = "entry";
        row.textContent = "[" + n.kind + "] " + n.message;
        panel.appendChild(row);
      });
    }
  };

  // ---------------- Regex builder (anchored popover, one per search field) ----------------
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function RegexBuilder(root) {
    this.root = root;
    this.input = root.querySelector('input[type="search"]');
    this.toggle = root.querySelector(".regex-toggle");
    this.popover = root.querySelector(".regex-popover");
    this.onQueryChange = null; // callback(query, isRegex, flags)
    this.isRegex = false;
    this.flags = "i";
    this.init();
  }
  RegexBuilder.prototype.init = function () {
    var self = this;
    if (this.toggle) {
      this.toggle.addEventListener("click", function () {
        var open = self.popover.getAttribute("data-open") === "true";
        self.popover.setAttribute("data-open", String(!open));
        self.toggle.setAttribute("aria-expanded", String(!open));
        if (!open) {
          var patternInput = self.popover.querySelector(".pattern-input");
          if (patternInput) patternInput.focus();
        }
      });
      document.addEventListener("click", function (e) {
        if (!self.root.contains(e.target)) self.popover.setAttribute("data-open", "false");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && self.popover.getAttribute("data-open") === "true") {
          self.popover.setAttribute("data-open", "false");
          self.toggle.focus();
        }
      });
    }
    var patternInput = this.popover ? this.popover.querySelector(".pattern-input") : null;
    var sampleInput = this.popover ? this.popover.querySelector(".sample-input") : null;
    var matchPreview = this.popover ? this.popover.querySelector(".match-preview") : null;
    var matchCount = this.popover ? this.popover.querySelector(".match-count") : null;
    var flagChecks = this.popover ? this.popover.querySelectorAll('[data-flag]') : [];
    var chips = this.popover ? this.popover.querySelectorAll(".chip") : [];
    var copyBtn = this.popover ? this.popover.querySelector(".copy-pattern") : null;

    function currentFlags() {
      var f = "";
      flagChecks.forEach(function (c) { if (c.checked) f += c.getAttribute("data-flag"); });
      return f;
    }

    function runPreview() {
      if (!patternInput) return;
      var pattern = patternInput.value;
      var sample = sampleInput ? sampleInput.value : "";
      var flags = currentFlags();
      if (!pattern) {
        if (matchPreview) matchPreview.innerHTML = "";
        if (matchCount) matchCount.textContent = "";
        return;
      }
      try {
        var re = new RegExp(pattern, flags.indexOf("g") === -1 ? flags + "g" : flags);
        var count = 0;
        var highlighted = escapeHtml(sample).replace(new RegExp(escapeHtml(pattern) === pattern ? pattern : pattern, flags.indexOf("g") === -1 ? flags + "g" : flags), function () {
          return arguments[0];
        });
        // Build highlighted output safely without re-escaping matches incorrectly
        var out = "";
        var lastIndex = 0;
        var m;
        var safeRe = new RegExp(pattern, flags.indexOf("g") === -1 ? flags + "g" : flags);
        while ((m = safeRe.exec(sample)) !== null) {
          count++;
          out += escapeHtml(sample.slice(lastIndex, m.index));
          out += "<mark>" + escapeHtml(m[0] || "") + "</mark>";
          lastIndex = m.index + (m[0] ? m[0].length : 1);
          if (m[0] === "") safeRe.lastIndex++;
          if (count > 500) break;
        }
        out += escapeHtml(sample.slice(lastIndex));
        if (matchPreview) matchPreview.innerHTML = out || "<em>(empty sample)</em>";
        if (matchCount) matchCount.textContent = count + " match" + (count === 1 ? "" : "es");
        if (patternInput) patternInput.setCustomValidity("");
      } catch (err) {
        if (matchPreview) matchPreview.textContent = "";
        if (matchCount) matchCount.textContent = "Invalid pattern: " + err.message;
      }
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (!patternInput) return;
        var insert = chip.getAttribute("data-insert") || "";
        var start = patternInput.selectionStart || patternInput.value.length;
        patternInput.value = patternInput.value.slice(0, start) + insert + patternInput.value.slice(start);
        patternInput.focus();
        runPreview();
      });
    });

    if (patternInput) patternInput.addEventListener("input", runPreview);
    if (sampleInput) sampleInput.addEventListener("input", runPreview);
    flagChecks.forEach(function (c) { c.addEventListener("change", runPreview); });

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = patternInput ? patternInput.value : "";
        if (navigator.clipboard && text) navigator.clipboard.writeText(text).catch(function () {});
        Notify.show("Pattern copied.", "info");
      });
    }

    // wire regex opt-in on the main field
    if (this.input && this.toggle) {
      var regexActive = false;
      var self2 = this;
      var mainToggleBtn = this.root.querySelector(".mode-toggle");
      if (mainToggleBtn) {
        mainToggleBtn.addEventListener("click", function () {
          regexActive = !regexActive;
          mainToggleBtn.setAttribute("aria-pressed", String(regexActive));
          mainToggleBtn.textContent = regexActive ? "Regex ON" : "Regex OFF";
          self2.isRegex = regexActive;
          if (patternInput && regexActive) patternInput.value = self2.input.value;
          fire();
        });
      }
      this.input.addEventListener("input", fire);
      function fire() {
        if (self2.onQueryChange) self2.onQueryChange(self2.input.value, regexActive, currentFlags() || "i");
      }
    }
  };

  function regexPopoverMarkup(idPrefix) {
    return (
      '<div class="regex-popover" id="' + idPrefix + '-popover" role="dialog" aria-label="Regex builder">' +
      "<h4>Regex builder</h4>" +
      '<label for="' + idPrefix + '-pattern">Pattern</label>' +
      '<input type="text" class="pattern-input" id="' + idPrefix + '-pattern" placeholder="e.g. ^tier[12]$">' +
      '<div class="chip-row" aria-label="Insert common tokens">' +
      '<button type="button" class="chip" data-insert="^">^ start</button>' +
      '<button type="button" class="chip" data-insert="$">$ end</button>' +
      '<button type="button" class="chip" data-insert="\\d">\\d digit</button>' +
      '<button type="button" class="chip" data-insert="\\w+">\\w+ word</button>' +
      '<button type="button" class="chip" data-insert="[^ ]+">[^ ]+ class</button>' +
      '<button type="button" class="chip" data-insert="(?:)">(?:) group</button>' +
      '<button type="button" class="chip" data-insert="|">| alternation</button>' +
      '<button type="button" class="chip" data-insert="*">* quantifier</button>' +
      "</div>" +
      '<div class="flag-row">' +
      '<label><input type="checkbox" data-flag="i" checked> ignore case</label>' +
      '<label><input type="checkbox" data-flag="m"> multiline</label>' +
      '<label><input type="checkbox" data-flag="s"> dot-all</label>' +
      "</div>" +
      '<label for="' + idPrefix + '-sample">Sample text</label>' +
      '<textarea id="' + idPrefix + '-sample" class="sample-input" rows="3" placeholder="Paste sample text to test against"></textarea>' +
      '<div class="match-preview" aria-live="polite"></div>' +
      '<div class="match-count"></div>' +
      '<button type="button" class="btn text copy-pattern" style="margin-top:8px;">Copy pattern</button>' +
      "</div>"
    );
  }

  function enhanceSearchField(root) {
    if (!root || root.dataset.regexReady) return;
    root.dataset.regexReady = "1";
    var idPrefix = root.id || "search-" + Math.random().toString(36).slice(2);
    root.id = idPrefix;
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "regex-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", idPrefix + "-popover");
    toggle.title = "Open the regex builder";
    toggle.textContent = ".*";
    root.appendChild(toggle);

    var modeToggle = document.createElement("button");
    modeToggle.type = "button";
    modeToggle.className = "regex-toggle mode-toggle";
    modeToggle.setAttribute("aria-pressed", "false");
    modeToggle.textContent = "Regex OFF";
    root.appendChild(modeToggle);

    var wrapper = document.createElement("div");
    wrapper.innerHTML = regexPopoverMarkup(idPrefix);
    root.appendChild(wrapper.firstChild);

    return new RegexBuilder(root);
  }

  // ---------------- Infinite colour picker ----------------
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
  }
  function relLuminance(r, g, b) {
    function chan(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }
  function contrastRatio(rgb1, rgb2) {
    var l1 = relLuminance.apply(null, rgb1) + 0.05;
    var l2 = relLuminance.apply(null, rgb2) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }

  function ColorPicker(root) {
    this.root = root;
    this.h = parseFloat(get("aw.accent.h", "100"));
    this.s = parseFloat(get("aw.accent.s", "30"));
    this.l = parseFloat(get("aw.accent.l", "38"));
    this.build();
  }
  ColorPicker.prototype.build = function () {
    var self = this;
    this.root.innerHTML =
      '<div class="color-field" tabindex="0" role="slider" aria-label="Saturation and lightness" aria-valuetext="">' +
      '<div class="thumb"></div></div>' +
      '<div>' +
      '<div class="hue-slider" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><div class="thumb"></div></div>' +
      '<div class="color-fields-grid" style="margin-top:12px;">' +
      '<label>Hex<input type="text" class="f-hex"></label>' +
      '<label>R<input type="text" class="f-r"></label>' +
      '<label>G<input type="text" class="f-g"></label>' +
      '<label>B<input type="text" class="f-b"></label>' +
      "</div>" +
      '<div class="color-swatch-preview" style="margin-top:8px;"></div>' +
      '<div class="contrast-readout"></div>' +
      "</div>";

    this.field = this.root.querySelector(".color-field");
    this.fieldThumb = this.field.querySelector(".thumb");
    this.hueEl = this.root.querySelector(".hue-slider");
    this.hueThumb = this.hueEl.querySelector(".thumb");
    this.hexIn = this.root.querySelector(".f-hex");
    this.rIn = this.root.querySelector(".f-r");
    this.gIn = this.root.querySelector(".f-g");
    this.bIn = this.root.querySelector(".f-b");
    this.swatch = this.root.querySelector(".color-swatch-preview");
    this.contrast = this.root.querySelector(".contrast-readout");

    this.field.style.background =
      "linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(" + this.h + " 100% 50%))";

    function setFromRatio(sx, ly) {
      self.s = Math.round(sx * 100);
      self.l = Math.round((1 - ly) * 100);
      self.commit();
    }
    function dragHandler(el, cb) {
      function pos(e) {
        var rect = el.getBoundingClientRect();
        var clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        var clientY = (e.touches ? e.touches[0].clientY : e.clientY);
        var x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        var y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
        cb(x, y);
      }
      el.addEventListener("pointerdown", function (e) {
        el.setPointerCapture(e.pointerId);
        pos(e);
        function move(ev) { pos(ev); }
        function up(ev) {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
        }
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      });
      el.addEventListener("keydown", function (e) {
        var step = 0.02;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) === -1) return;
        e.preventDefault();
        var rect = el.getBoundingClientRect();
        var curX = parseFloat(el.dataset.x || "0.5");
        var curY = parseFloat(el.dataset.y || "0.5");
        if (e.key === "ArrowLeft") curX -= step;
        if (e.key === "ArrowRight") curX += step;
        if (e.key === "ArrowUp") curY -= step;
        if (e.key === "ArrowDown") curY += step;
        curX = Math.min(1, Math.max(0, curX));
        curY = Math.min(1, Math.max(0, curY));
        el.dataset.x = curX; el.dataset.y = curY;
        cb(curX, curY);
      });
    }
    dragHandler(this.field, function (x, y) { self.field.dataset.x = x; self.field.dataset.y = y; setFromRatio(x, y); });
    dragHandler(this.hueEl, function (x) { self.h = Math.round(x * 360); self.commit(); });

    [this.hexIn, this.rIn, this.gIn, this.bIn].forEach(function (input) {
      input.addEventListener("change", function () { self.commitFromFields(); });
    });

    this.render();
  };
  ColorPicker.prototype.commit = function () {
    set("aw.accent.h", this.h);
    set("aw.accent.s", this.s);
    set("aw.accent.l", this.l);
    Theme.applyAccentAndDensity();
    this.render();
  };
  ColorPicker.prototype.commitFromFields = function () {
    var hex = this.hexIn.value.trim();
    var r, g, b;
    if (/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      hex = hex.replace("#", "");
      r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16);
    } else {
      r = parseInt(this.rIn.value, 10) || 0; g = parseInt(this.gIn.value, 10) || 0; b = parseInt(this.bIn.value, 10) || 0;
    }
    var max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    var l = (max + min) / 2;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r / 255) h = ((g / 255 - b / 255) / d) % 6;
      else if (max === g / 255) h = (b / 255 - r / 255) / d + 2;
      else h = (r / 255 - g / 255) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    this.h = h; this.s = s * 100; this.l = l * 100;
    this.commit();
  };
  ColorPicker.prototype.render = function () {
    var rgb = hslToRgb(this.h, this.s, this.l);
    var hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
    this.hexIn.value = hex;
    this.rIn.value = rgb[0]; this.gIn.value = rgb[1]; this.bIn.value = rgb[2];
    this.swatch.style.background = hex;
    this.field.style.background = "linear-gradient(to top, black, transparent), linear-gradient(to right, white, hsl(" + this.h + " 100% 50%))";
    this.fieldThumb.style.left = (this.s) + "%";
    this.fieldThumb.style.top = (100 - this.l) + "%";
    this.hueThumb.style.left = (this.h / 360 * 100) + "%";
    var onWhite = contrastRatio(rgb, [255, 255, 255]);
    var onBlack = contrastRatio(rgb, [0, 0, 0]);
    this.contrast.textContent =
      "Contrast vs white " + onWhite.toFixed(2) + ":1, vs black " + onBlack.toFixed(2) + ":1" +
      (Math.max(onWhite, onBlack) >= 4.5 ? " (AA text ok on the better side)" : " (may fail AA text contrast)");
    this.field.setAttribute("aria-valuetext", "saturation " + Math.round(this.s) + "%, lightness " + Math.round(this.l) + "%");
  };

  // ---------------- Command palette ----------------
  var SITE_INDEX = window.AW_SITE_INDEX || [];

  var Palette = {
    scrim: null,
    input: null,
    list: null,
    active: 0,
    filtered: [],
    init: function () {
      document.addEventListener("keydown", function (e) {
        if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
          e.preventDefault();
          Palette.open();
        }
        if (e.key === "Escape") Palette.close();
      });
    },
    ensureBuilt: function () {
      if (this.scrim) return;
      this.scrim = document.createElement("div");
      this.scrim.className = "palette-scrim";
      this.scrim.innerHTML =
        '<div class="palette" role="dialog" aria-label="Command palette">' +
        '<input type="text" placeholder="Search pages, sections, settings…" aria-label="Command palette search">' +
        '<ul role="listbox"></ul>' +
        "</div>";
      document.body.appendChild(this.scrim);
      this.input = this.scrim.querySelector("input");
      this.list = this.scrim.querySelector("ul");
      var self = this;
      this.scrim.addEventListener("click", function (e) { if (e.target === self.scrim) self.close(); });
      this.input.addEventListener("input", function () { self.filter(self.input.value); });
      this.input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); self.move(1); }
        if (e.key === "ArrowUp") { e.preventDefault(); self.move(-1); }
        if (e.key === "Enter") { e.preventDefault(); self.activate(); }
      });
    },
    open: function () {
      this.ensureBuilt();
      this.scrim.setAttribute("data-open", "true");
      this.input.value = "";
      this.filter("");
      this.input.focus();
    },
    close: function () {
      if (this.scrim) this.scrim.setAttribute("data-open", "false");
    },
    filter: function (q) {
      q = q.toLowerCase();
      this.filtered = SITE_INDEX.filter(function (item) {
        return item.label.toLowerCase().indexOf(q) !== -1 || (item.keywords || "").toLowerCase().indexOf(q) !== -1;
      });
      this.active = 0;
      this.renderList();
    },
    renderList: function () {
      var self = this;
      this.list.innerHTML = "";
      if (!this.filtered.length) {
        var li = document.createElement("li");
        li.textContent = "No matches.";
        li.style.padding = "10px 12px";
        li.style.fontSize = ".85rem";
        this.list.appendChild(li);
        return;
      }
      this.filtered.forEach(function (item, i) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-active", String(i === self.active));
        btn.innerHTML = item.label + '<span class="kind">' + item.kind + "</span>";
        btn.addEventListener("click", function () { self.go(item); });
        li.appendChild(btn);
        self.list.appendChild(li);
      });
    },
    move: function (delta) {
      if (!this.filtered.length) return;
      this.active = (this.active + delta + this.filtered.length) % this.filtered.length;
      this.renderList();
    },
    activate: function () {
      if (this.filtered[this.active]) this.go(this.filtered[this.active]);
    },
    go: function (item) {
      this.close();
      var here = location.pathname.split("/").pop() || "index.html";
      var target = item.href.split("#")[0] || "index.html";
      if (target === here || (target === "" && here === "index.html")) {
        Palette.focusFragment(item.href.split("#")[1]);
      } else {
        sessionStorage.setItem("aw.palette.target", item.href.split("#")[1] || "");
        location.href = item.href;
      }
    },
    focusFragment: function (id) {
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("tabindex", "-1");
      el.focus();
      el.classList.add("palette-highlight");
      setTimeout(function () { el.classList.remove("palette-highlight"); }, 1600);
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    TabDock.init();
    Notify.init();
    Palette.init();

    var pending = sessionStorage.getItem("aw.palette.target");
    if (pending) {
      sessionStorage.removeItem("aw.palette.target");
      setTimeout(function () { Palette.focusFragment(pending); }, 60);
    }

    window.AW_SEARCH_BUILDERS = {};
    document.querySelectorAll(".search-field").forEach(function (f) {
      var inst = enhanceSearchField(f);
      if (inst) window.AW_SEARCH_BUILDERS[f.id] = inst;
      document.dispatchEvent(new CustomEvent("aw:search-ready", { detail: { id: f.id, instance: inst } }));
    });
    document.querySelectorAll("[data-color-picker]").forEach(function (el) { new ColorPicker(el); });

    // internal link check helper exposed for check-site.mjs debugging in-browser (no-op in prod)
    window.AW = { Theme: Theme, Notify: Notify, Palette: Palette };
  });
})();
