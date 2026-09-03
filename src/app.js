(() => {
  "use strict";

  const STORAGE_KEY = "emrys-state-v2";
  const LEGACY_KEY = "emrys-state-v1";
  const ONBOARDING_KEY = "emrys-onboarding-v1";
  const BOOT_KEY = "emrys-booted";
  const defaults = {
    favorites: [],
    history: {},
    settings: { theme: "dark", reducedMotion: false, blur: 18, scale: 100, cardSize: "comfortable", music: false, sfx: true },
  };

  const games = typeof G_DATA !== "undefined" && Array.isArray(G_DATA) ? G_DATA : [];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const slugify = value => value.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const gameById = id => games.find(game => String(game.id) === String(id));
  const coverPath = game => `./assets/games/${slugify(game.n)}/cover.webp`;
  const heroPath = game => `./assets/games/${slugify(game.n)}/hero.webp`;
  const primaryGenre = game => game.tags?.[0] || "Game";
  const isFavorite = id => state.favorites.includes(String(id));
  const formatWhen = timestamp => {
    const delta = Date.now() - timestamp;
    if (delta < 60_000) return "Just now";
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} hr ago`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || "{}";
      const saved = JSON.parse(raw);
      return { ...defaults, ...saved, settings: { ...defaults.settings, ...(saved.settings || {}) } };
    } catch {
      return { ...defaults, settings: { ...defaults.settings } };
    }
  };

  let state = loadState();
  let activeGame = null;
  let activeGenre = "All";
  let toastTimer;
  let clockTimer;
  let audioContext;
  let ambience;

  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  window.imageFallback = image => {
    if (!image.dataset.fallbackUsed && image.dataset.remote) {
      image.dataset.fallbackUsed = "true";
      image.src = image.dataset.remote;
      return;
    }
    image.onerror = null;
    image.removeAttribute("src");
    image.alt = `${image.alt || "Game"} artwork unavailable`;
    image.classList.add("image-missing");
  };

  const image = (game, kind, className = "") => {
    const local = kind === "hero" ? heroPath(game) : coverPath(game);
    const remote = kind === "hero" ? game.bg : game.img;
    return `<img class="${className}" src="${escapeHTML(local)}" data-remote="${escapeHTML(remote)}" alt="${escapeHTML(game.n)} artwork" loading="lazy" decoding="async" onerror="imageFallback(this)">`;
  };

  const toast = message => {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 2100);
  };

  const beep = (frequency = 470, duration = 0.045) => {
    if (!state.settings.sfx) return;
    try {
      audioContext ||= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.024, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Audio is an optional local enhancement. */ }
  };

  const setAmbience = enabled => {
    if (!enabled) {
      if (ambience) ambience.oscillator.stop();
      ambience = null;
      return;
    }
    try {
      audioContext ||= new AudioContext();
      if (ambience) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 48;
      gain.gain.value = 0.009;
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      ambience = { oscillator, gain };
    } catch { /* Browsers can block audio before a user gesture. */ }
  };

  const applySettings = () => {
    const settings = state.settings;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--blur", `${settings.blur}px`);
    document.documentElement.style.setProperty("--scale", settings.scale / 100);
    document.documentElement.style.setProperty("--card-min", settings.cardSize === "compact" ? "165px" : settings.cardSize === "large" ? "245px" : "205px");
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
    $("meta[name=theme-color]").content = settings.theme === "dark" ? "#00020c" : "#e9ecf7";
    $$("[data-setting][data-value]").forEach(button => button.classList.toggle("active", settings[button.dataset.setting] === button.dataset.value));
    $$("input[data-setting]").forEach(input => {
      const value = settings[input.dataset.setting];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value;
    });
    $("#blur-value").textContent = `${settings.blur}px`;
    $("#scale-value").textContent = `${settings.scale}%`;
    setAmbience(Boolean(settings.music && audioContext));
  };

  const cardMarkup = game => `<article class="game-card" data-game-card="${escapeHTML(game.id)}">
    <div class="card-visual">
      ${image(game, "cover")}
      <div class="card-overlay"></div>
      <button class="visual-open" data-open-game="${escapeHTML(game.id)}" aria-label="View ${escapeHTML(game.n)} details"></button>
      <div class="card-controls">
        <button class="play-orb" data-play-game="${escapeHTML(game.id)}" aria-label="Play ${escapeHTML(game.n)}">▶</button>
        <button class="favorite-button ${isFavorite(game.id) ? "saved" : ""}" data-favorite="${escapeHTML(game.id)}" aria-label="${isFavorite(game.id) ? "Remove" : "Add"} ${escapeHTML(game.n)} ${isFavorite(game.id) ? "from" : "to"} favorites">${isFavorite(game.id) ? "♥" : "♡"}</button>
      </div>
    </div>
    <div class="card-copy"><button class="card-title" data-open-game="${escapeHTML(game.id)}"><h3>${escapeHTML(game.n)}</h3></button><p>${escapeHTML(game.dev)} · ${escapeHTML(primaryGenre(game))}</p></div>
  </article>`;

  const landscapeMarkup = (game, entry) => `<article class="landscape-card">
    ${image(game, "hero")}
    <button class="visual-open" data-open-game="${escapeHTML(game.id)}" aria-label="View ${escapeHTML(game.n)} details"></button>
    <div class="landscape-copy"><strong>${escapeHTML(game.n)}</strong><p>${entry ? `${formatWhen(entry.lastPlayed)} · ${entry.sessions} session${entry.sessions === 1 ? "" : "s"}` : `${escapeHTML(game.dev)} · ${escapeHTML(primaryGenre(game))}`}</p>${entry ? `<div class="progress"><i style="width:${Math.min(92, 22 + entry.sessions * 10)}%"></i></div>` : ""}</div>
  </article>`;

  const historyItems = () => Object.entries(state.history)
    .map(([id, entry]) => ({ game: gameById(id), ...entry }))
    .filter(item => item.game)
    .sort((a, b) => b.lastPlayed - a.lastPlayed);

  const preferenceGenres = () => {
    try { return JSON.parse(localStorage.getItem(ONBOARDING_KEY) || "{}").genres || []; }
    catch { return []; }
  };

  const featuredGame = () => historyItems()[0]?.game || games[0];

  const renderSkeletons = () => {
    const skeleton = `<div class="skeleton-card"><i></i><b></b><span></span></div>`;
    $("#popular-grid").innerHTML = skeleton.repeat(4);
    $("#recently-added-grid").innerHTML = skeleton.repeat(6);
  };

  const renderHome = () => {
    const featured = featuredGame();
    if (!featured) return;
    $("#featured-hero").innerHTML = `${image(featured, "hero")}<div class="feature-index"><strong>01</strong><span>FEATURED WORLD</span></div><div class="feature-copy"><p class="system-label">READY TO LAUNCH · ${escapeHTML(primaryGenre(featured).toUpperCase())}</p><h2>${escapeHTML(featured.n)}</h2><p>${escapeHTML(featured.desc || `Explore ${featured.n} from your Emrys library.`)}</p><div class="feature-actions"><button class="action primary" data-play-game="${escapeHTML(featured.id)}">▶ Start playing</button><button class="action secondary" data-open-game="${escapeHTML(featured.id)}">View details</button></div></div>`;
    const history = historyItems();
    const queue = history.length ? history.slice(0, 4).map(item => item.game) : games.slice(1, 5);
    $("#quick-queue").innerHTML = queue.map(game => `<button class="queue-item" data-play-game="${escapeHTML(game.id)}">${image(game, "cover")}<span><strong>${escapeHTML(game.n)}</strong><span>${escapeHTML(primaryGenre(game))} · ${history.find(item => item.game.id === game.id) ? "Resume" : "Ready"}</span></span><i>▶</i></button>`).join("");
    $("#library-count").textContent = `${games.length} games indexed`;
    const genres = ["Action", "Adventure", "RPG", "Multiplayer", "Racing", "Horror"];
    const tones = ["#8b7cff", "#4e7cff", "#66e5ff", "#22e887", "#ffc857", "#ff6b84"];
    $("#home-categories").innerHTML = genres.map((genre, index) => {
      const count = games.filter(game => game.tags?.some(tag => tag.toLowerCase().includes(genre.toLowerCase()))).length;
      return `<button class="category-chip" style="--tone:${tones[index]}" data-category="${genre}"><span>${count} games</span><strong>${genre}</strong></button>`;
    }).join("");
    const continueItems = history.length ? history.slice(0, 7) : games.slice(1, 8).map(game => ({ game, lastPlayed: 0, sessions: 0 }));
    $("#continue-section h2").textContent = history.length ? "Continue playing" : "Start a new session";
    $("#continue-row").innerHTML = continueItems.map(item => landscapeMarkup(item.game, item.sessions ? item : null)).join("");
    const prefs = preferenceGenres();
    const ordered = prefs.length ? [...games].sort((a, b) => Number(prefs.some(p => a.tags?.includes(p))) < Number(prefs.some(p => b.tags?.includes(p))) ? 1 : -1) : games;
    $("#popular-grid").innerHTML = ordered.slice(0, 7).map(cardMarkup).join("");
    $("#recently-added-grid").innerHTML = games.slice(-8).reverse().map(cardMarkup).join("");
  };

  const genres = () => ["All", ...new Set(games.flatMap(game => game.tags || []))].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));

  const renderFilters = () => {
    $("#genre-filters").innerHTML = genres().map(genre => `<button class="${activeGenre === genre ? "active" : ""}" data-filter="${escapeHTML(genre)}">${escapeHTML(genre)}</button>`).join("");
  };

  const filteredGames = () => {
    const query = $("#library-search").value.trim().toLowerCase();
    return games.filter(game => {
      const matchesGenre = activeGenre === "All" || game.tags?.includes(activeGenre);
      const haystack = [game.n, game.dev, ...(game.tags || [])].join(" ").toLowerCase();
      return matchesGenre && (!query || haystack.includes(query));
    });
  };

  const renderLibrary = () => {
    const items = filteredGames();
    $("#library-grid").innerHTML = items.map(cardMarkup).join("");
    $("#result-count").textContent = items.length;
    $("#library-empty").hidden = items.length !== 0;
    renderFilters();
  };

  const renderFavorites = () => {
    const items = state.favorites.map(gameById).filter(Boolean);
    $("#favorites-grid").innerHTML = items.map(cardMarkup).join("");
    $("#favorites-empty").hidden = items.length !== 0;
    $("#profile-favs").textContent = items.length;
  };

  const renderRecent = () => {
    const items = historyItems();
    $("#recent-grid").innerHTML = items.map(item => cardMarkup(item.game)).join("");
    $("#recent-empty").hidden = items.length !== 0;
    $("#profile-played").textContent = items.length;
  };

  const renderAll = () => {
    renderHome();
    renderLibrary();
    renderFavorites();
    renderRecent();
    document.body.dataset.loading = "false";
  };

  const navigate = view => {
    const target = $(`#view-${view}`) || $("#view-home");
    $$(".view").forEach(section => section.classList.toggle("active", section === target));
    $$("[data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === view));
    window.history.replaceState(null, "", view === "home" ? location.pathname : `#${view}`);
    window.scrollTo({ top: 0, behavior: state.settings.reducedMotion ? "auto" : "smooth" });
    $("#main-content").focus({ preventScroll: true });
    if (view === "library") renderLibrary();
    if (view === "favorites") renderFavorites();
    if (view === "recent") renderRecent();
  };

  const toggleFavorite = id => {
    const key = String(id);
    if (isFavorite(key)) state.favorites = state.favorites.filter(value => value !== key);
    else state.favorites.push(key);
    saveState();
    renderAll();
    if (activeGame) updateDetailFavorite();
    beep(isFavorite(key) ? 620 : 390);
    toast(isFavorite(key) ? "Added to your orbit" : "Removed from favorites");
  };

  const requirementsMarkup = requirements => Object.entries(requirements || {}).map(([key, value]) => `<dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd>`).join("");

  const updateDetailFavorite = () => {
    if (!activeGame) return;
    const saved = isFavorite(activeGame.id);
    $("#detail-favorite").classList.toggle("saved", saved);
    $("#detail-favorite").innerHTML = `${saved ? "♥" : "♡"} <span>${saved ? "Saved to favorites" : "Add to favorites"}</span>`;
  };

  const openDetails = game => {
    if (!game) return;
    activeGame = game;
    const hero = $("#detail-hero");
    hero.src = heroPath(game); hero.dataset.remote = game.bg; hero.alt = `${game.n} hero artwork`; delete hero.dataset.fallbackUsed;
    const cover = $("#detail-cover");
    cover.src = coverPath(game); cover.dataset.remote = game.img; cover.alt = `${game.n} cover artwork`; delete cover.dataset.fallbackUsed;
    $("#detail-title").textContent = game.n;
    $("#detail-developer").textContent = `${game.dev} · Browser launch`;
    $("#detail-tags").innerHTML = (game.tags || []).map(tag => `<span>${escapeHTML(tag)}</span>`).join("");
    $("#detail-description").textContent = game.desc || `Open ${game.n} from your browser using the provider link included in this project.`;
    $("#minimum-req").innerHTML = requirementsMarkup(game.rm);
    $("#recommended-req").innerHTML = requirementsMarkup(game.rr);
    const related = games.filter(item => item.id !== game.id && item.tags?.some(tag => game.tags?.includes(tag))).slice(0, 3);
    $("#related-games").innerHTML = related.map(item => `<button class="related-game" data-open-game="${escapeHTML(item.id)}">${image(item, "hero")}<span>${escapeHTML(item.n)}</span></button>`).join("");
    updateDetailFavorite();
    $("#game-details").showModal();
  };

  const recordLaunch = game => {
    const previous = state.history[String(game.id)] || { sessions: 0 };
    state.history[String(game.id)] = { lastPlayed: Date.now(), sessions: previous.sessions + 1 };
    saveState();
    renderAll();
  };

  const launchGame = (game, mode = "iframe") => {
    if (!game?.url) return;
    activeGame = game;
    recordLaunch(game);
    beep(560, 0.07);
    if (mode === "external") {
      window.open(game.url, "_blank", "noopener,noreferrer");
      toast("Provider opened in a new tab");
      return;
    }
    if ($("#game-details").open) $("#game-details").close();
    const session = $("#game-session");
    $("#session-title").textContent = game.n;
    const art = $("#session-art"); art.src = coverPath(game); art.dataset.remote = game.img; art.alt = `${game.n} cover`;
    $("#game-frame").src = game.url;
    session.hidden = false;
    document.body.style.overflow = "hidden";
    $("#iframe-notice").style.opacity = "1";
    setTimeout(() => { if (!session.hidden) $("#iframe-notice").style.opacity = ".3"; }, 8000);
  };

  const exitSession = async () => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    $("#game-session").hidden = true;
    $("#game-frame").src = "about:blank";
    $("#shortcuts").hidden = true;
    document.body.style.overflow = "";
    toast("Session closed");
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#game-session").requestFullscreen();
  };

  const togglePointer = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    else $("#game-frame").requestPointerLock?.();
  };

  const openSearch = () => {
    const dialog = $("#search-dialog");
    if (!dialog.open) dialog.showModal();
    $("#global-search").value = "";
    renderSearch("");
    requestAnimationFrame(() => $("#global-search").focus());
  };

  const renderSearch = query => {
    const normalized = query.trim().toLowerCase();
    const items = games.filter(game => !normalized || [game.n, game.dev, ...(game.tags || [])].join(" ").toLowerCase().includes(normalized)).slice(0, 12);
    $("#search-count").textContent = `${items.length}${items.length === 12 && !normalized ? "+" : ""} game${items.length === 1 ? "" : "s"}`;
    $("#search-results").innerHTML = items.map(game => `<button class="search-result" data-open-game="${escapeHTML(game.id)}">${image(game, "cover")}<span><strong>${escapeHTML(game.n)}</strong><span>${escapeHTML(game.dev)} · ${escapeHTML(primaryGenre(game))}</span></span><i>↗</i></button>`).join("");
    $("#search-empty").hidden = items.length !== 0;
  };

  const updateNetwork = () => {
    const online = navigator.onLine;
    $("#network-text").textContent = online ? "Online" : "Offline";
    $("#lock-network").textContent = online ? "Connected" : "Offline";
    $("#network-dot").style.background = online ? "var(--status-ready)" : "var(--status-error)";
    $("#connection-pill").setAttribute("aria-label", online ? "Network connection available" : "Network connection unavailable");
  };

  const updateController = connected => {
    $("#controller-text").textContent = connected ? "Controller connected" : "Keyboard ready";
    $("#session-controller").textContent = connected ? "Controller connected" : "Keyboard ready";
    $("#controller-dot").style.background = connected ? "var(--status-ready)" : "var(--accent-info)";
  };

  const handleSetting = (name, value) => {
    state.settings[name] = value;
    saveState();
    applySettings();
    if (name === "music") setAmbience(Boolean(value));
    if (name === "cardSize") renderAll();
    beep(520);
  };

  const updateClock = () => {
    const now = new Date();
    $("#lock-clock").textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    $("#lock-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  };

  const showLock = () => {
    $("#boot").hidden = true;
    const lock = $("#lock-screen");
    lock.hidden = false;
    const hero = featuredGame();
    if (hero) {
      $("#lock-art").src = heroPath(hero);
      $("#lock-art").dataset.remote = hero.bg;
    }
    updateClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(updateClock, 30_000);
    lock.focus();
  };

  const unlock = () => {
    const lock = $("#lock-screen");
    if (lock.hidden || lock.classList.contains("is-unlocking")) return;
    lock.classList.add("is-unlocking");
    $("#app-shell").setAttribute("aria-hidden", "false");
    beep(640, 0.08);
    setTimeout(() => {
      lock.hidden = true;
      lock.classList.remove("is-unlocking");
      clearInterval(clockTimer);
      const hash = location.hash.slice(1);
      if (hash) navigate(hash);
      if (!localStorage.getItem(ONBOARDING_KEY)) setTimeout(() => $("#onboarding").showModal(), state.settings.reducedMotion ? 10 : 320);
    }, state.settings.reducedMotion ? 10 : 690);
  };

  const runBoot = () => {
    if (sessionStorage.getItem(BOOT_KEY)) {
      showLock();
      return;
    }
    const reduced = state.settings.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 500 : 2600;
    const start = performance.now();
    const bar = $("#boot-progress-bar");
    const progress = $(".boot-progress");
    const status = $("#boot-status");
    const tick = now => {
      const amount = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - amount, 3);
      const value = Math.round(eased * 100);
      bar.style.width = `${value}%`;
      progress.setAttribute("aria-valuenow", value);
      status.textContent = value < 42 ? "Calibrating interface" : value < 78 ? "Indexing game library" : value < 100 ? "Opening the signal" : "Emrys is ready";
      if (amount < 1) requestAnimationFrame(tick);
      else {
        $("#boot-start").hidden = false;
        status.classList.add("ready");
      }
    };
    requestAnimationFrame(tick);
  };

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) { navigate(nav.dataset.nav); return; }
    const play = event.target.closest("[data-play-game]");
    if (play) { launchGame(gameById(play.dataset.playGame)); return; }
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
    const open = event.target.closest("[data-open-game]");
    if (open) {
      if ($("#search-dialog").open) $("#search-dialog").close();
      openDetails(gameById(open.dataset.openGame));
      return;
    }
    const category = event.target.closest("[data-category]");
    if (category) {
      activeGenre = category.dataset.category;
      $("#library-search").value = "";
      navigate("library");
      renderLibrary();
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) { activeGenre = filter.dataset.filter; renderLibrary(); }
  });

  $("#boot-start").addEventListener("click", () => { sessionStorage.setItem(BOOT_KEY, "true"); $("#boot").classList.add("is-leaving"); setTimeout(showLock, state.settings.reducedMotion ? 10 : 560); });
  $("#skip-intro").addEventListener("click", () => { sessionStorage.setItem(BOOT_KEY, "true"); showLock(); });
  $("#unlock-control").addEventListener("click", unlock);
  $("#lock-screen").addEventListener("click", event => { if (!event.target.closest(".lock-header")) unlock(); });
  $("#lock-screen").addEventListener("keydown", event => { if (["Enter", " ", "ArrowUp"].includes(event.key)) { event.preventDefault(); unlock(); } });
  let touchStart = 0;
  $("#lock-screen").addEventListener("touchstart", event => { touchStart = event.touches[0].clientY; }, { passive: true });
  $("#lock-screen").addEventListener("touchend", event => { if (touchStart - event.changedTouches[0].clientY > 35) unlock(); }, { passive: true });

  $("#library-search").addEventListener("input", renderLibrary);
  $("#clear-library-search").addEventListener("click", () => { activeGenre = "All"; $("#library-search").value = ""; renderLibrary(); });
  $("#open-search").addEventListener("click", openSearch);
  $("#mobile-search").addEventListener("click", openSearch);
  $("#close-search").addEventListener("click", () => $("#search-dialog").close());
  $("#global-search").addEventListener("input", event => renderSearch(event.target.value));
  $(".close-details.round-button").addEventListener("click", () => $("#game-details").close());
  $(".detail-back").addEventListener("click", () => $("#game-details").close());
  $("#game-details").addEventListener("click", event => { if (event.target === $("#game-details")) $("#game-details").close(); });
  $("#search-dialog").addEventListener("click", event => { if (event.target === $("#search-dialog")) $("#search-dialog").close(); });
  $("#detail-favorite").addEventListener("click", () => activeGame && toggleFavorite(activeGame.id));
  $("#detail-play").addEventListener("click", () => launchGame(activeGame));
  $("#detail-external").addEventListener("click", () => launchGame(activeGame, "external"));
  $("#exit-session").addEventListener("click", exitSession);
  $("#fullscreen-button").addEventListener("click", toggleFullscreen);
  $("#pointer-button").addEventListener("click", togglePointer);
  $("#help-button").addEventListener("click", () => $("#shortcuts").hidden = false);
  $("#close-help").addEventListener("click", () => $("#shortcuts").hidden = true);
  $("#session-external").addEventListener("click", () => launchGame(activeGame, "external"));
  $("#clear-history").addEventListener("click", () => { state.history = {}; saveState(); renderAll(); toast("Play history cleared"); });
  $("#restart-intro").addEventListener("click", () => { sessionStorage.removeItem(BOOT_KEY); location.hash = ""; location.reload(); });

  $$("input[data-setting]").forEach(input => input.addEventListener("input", () => handleSetting(input.dataset.setting, input.type === "checkbox" ? input.checked : Number(input.value))));
  $("#settings-form").addEventListener("click", event => {
    const button = event.target.closest("[data-setting][data-value]");
    if (button) handleSetting(button.dataset.setting, button.dataset.value);
  });
  $$(".choice-grid").forEach(group => group.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (group.dataset.choice === "genres") button.classList.toggle("selected");
    else { $$("button", group).forEach(item => item.classList.remove("selected")); button.classList.add("selected"); }
  }));
  $("#onboarding-form").addEventListener("submit", event => {
    const value = event.submitter?.value;
    if (value === "save") {
      const choices = {
        genres: $$('.choice-grid[data-choice="genres"] .selected').map(button => button.dataset.value),
        input: $('.choice-grid[data-choice="input"] .selected')?.dataset.value || "keyboard",
        mode: $('.choice-grid[data-choice="mode"] .selected')?.dataset.value || "performance",
      };
      localStorage.setItem(ONBOARDING_KEY, JSON.stringify(choices));
      renderHome();
      toast("Your orbit is calibrated");
    } else localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ skipped: true }));
  });

  document.addEventListener("keydown", event => {
    if (event.key === "/" && !/input|textarea/i.test(event.target.tagName)) { event.preventDefault(); openSearch(); }
    if (event.key === "Escape" && $("#search-dialog").open) $("#search-dialog").close();
    if (!$("#game-session").hidden) {
      if (event.shiftKey && event.key === "Escape") exitSession();
      if (event.key.toLowerCase() === "f") toggleFullscreen();
      if (event.key.toLowerCase() === "p") togglePointer();
    }
  });
  window.addEventListener("online", updateNetwork);
  window.addEventListener("offline", updateNetwork);
  window.addEventListener("gamepadconnected", () => updateController(true));
  window.addEventListener("gamepaddisconnected", () => updateController(false));
  $(".mobile-controls").addEventListener("pointerdown", event => { const button = event.target.closest("button"); if (button && activeGame) $("#game-frame").contentWindow?.postMessage({ type: "emrys-control", key: button.textContent.trim(), pressed: true }, "*"); });
  $(".mobile-controls").addEventListener("pointerup", event => { const button = event.target.closest("button"); if (button && activeGame) $("#game-frame").contentWindow?.postMessage({ type: "emrys-control", key: button.textContent.trim(), pressed: false }, "*"); });
  document.addEventListener("pointerdown", () => { if (state.settings.music) setAmbience(true); }, { once: true });

  applySettings();
  updateNetwork();
  updateController(Boolean(navigator.getGamepads?.()?.some(Boolean)));
  renderSkeletons();
  requestAnimationFrame(renderAll);
  runBoot();
})();
