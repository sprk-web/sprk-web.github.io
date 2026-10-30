import { SITE_CONFIG, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { getPrimarySupabaseClient } from "./supabaseClient.js";

(() => {
  const sidebarPreferenceKey = "sprk-sidebar-collapsed";
  const appUrl = (path) => path.startsWith("#")
    ? path
    : new URL(path, new URL("../", import.meta.url)).href.replace(/\/index\.html(?=([?#]|$))/, "/");
  if (location.pathname.endsWith("/index.html")) {
    const cleanUrl = new URL(location.href);
    cleanUrl.pathname = cleanUrl.pathname.slice(0, -"index.html".length);
    history.replaceState(history.state, "", cleanUrl);
  }
  const page = document.body.dataset.page || "home";
  try {
    if (localStorage.getItem(sidebarPreferenceKey) === "true") {
      document.body.classList.add("sidebar-collapsed");
    }
  } catch (error) {
    console.error("Could not restore the saved sidebar preference.", error);
  }
  const main = document.querySelector("main");
  if (!main) throw new Error("The shared SPRK shell requires a <main> element.");
  document.title = SITE_CONFIG.pageTitles[page] || SITE_CONFIG.name;

  const navLink = ({ key, label, icon, path }, compact = false) => `
    <a class="nav-link flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm no-underline ${compact ? "max-[900px]:min-h-[68px] max-[900px]:flex-col max-[900px]:justify-center max-[900px]:gap-1.5 max-[900px]:px-0 max-[900px]:py-1 max-[900px]:text-[10px]" : ""}" href="${appUrl(path)}" title="${label}"${page === key ? ' aria-current="page"' : ""}>
      <i data-lucide="${icon}" class="h-6 w-6 shrink-0"></i><span class="nav-label">${label}</span>
    </a>`;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
  const loadHeaderSupabase = async () => {
    if (window.supabase?.createClient) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the account service."));
      document.head.append(script);
    });
    if (!window.supabase?.createClient) throw new Error("The account service did not initialize.");
  };
  let headerProfileRequest = 0;
  const updateHeaderProfile = async (client, user) => {
    const control = document.querySelector("#auth-button");
    if (!control) return;
    const requestId = ++headerProfileRequest;
    if (!user) {
      control.href = accountHref;
      control.title = "Login / account";
      control.setAttribute("aria-label", headerConfig.accountLabel);
      control.innerHTML = '<span class="header-profile-fallback" aria-hidden="true"><i data-lucide="user-round" class="h-5 w-5"></i></span>';
      window.lucide?.createIcons();
      return;
    }

    const { data: profile, error } = await client
      .from("profiles")
      .select("display_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (requestId !== headerProfileRequest || sessionData.session?.user?.id !== user.id) return;

    const label = profile?.display_name || user.email || "Your profile";
    control.href = appUrl("account/");
    control.title = label;
    control.setAttribute("aria-label", `Your profile: ${label}`);
    if (profile?.avatar_url) {
      control.innerHTML = `<img class="header-profile-image" src="${escapeHtml(profile.avatar_url)}" alt="">`;
      control.querySelector("img").addEventListener("error", () => {
        control.innerHTML = `<span class="header-profile-initial" aria-hidden="true">${escapeHtml(label.trim().slice(0, 1).toUpperCase() || "U")}</span>`;
      }, { once: true });
    } else {
      control.innerHTML = `<span class="header-profile-initial" aria-hidden="true">${escapeHtml(label.trim().slice(0, 1).toUpperCase() || "U")}</span>`;
    }
  };
  async function initializeHeaderProfile() {
    const control = document.querySelector("#auth-button");
    if (!control || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    await loadHeaderSupabase();
    const client = getPrimarySupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await updateHeaderProfile(client, data.session?.user || null);
    client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        updateHeaderProfile(client, session?.user || null).catch((profileError) => {
          console.error("Could not update the signed-in profile in the header.", profileError);
        });
      }, 0);
    });
  }

  const headerConfig = SITE_CONFIG.header;
  const sidebarConfig = SITE_CONFIG.sidebar;
  const accountHref = page === "simulations"
    ? `${appUrl("account/")}?return=${encodeURIComponent(new URL(appUrl("simulator/")).pathname)}`
    : appUrl("account/");
  const profileControl = SITE_CONFIG.controls.showMainAuth && headerConfig.showAccountButton
    ? `<a id="auth-button" href="${accountHref}" class="ml-1 grid h-10 w-10 place-items-center overflow-hidden rounded-full hover:bg-[#f2f2f2]" aria-label="${headerConfig.accountLabel}" title="Login / account"><span class="header-profile-fallback" aria-hidden="true"><i data-lucide="user-round" class="h-5 w-5"></i></span></a>`
    : "";
  const mobileLayout = window.matchMedia("(max-width: 620px)");
  const linksByKey = new Map([
    ...SITE_CONFIG.navigation,
    ...sidebarConfig.personalizationLinks,
  ].map((link) => [link.key, link]));
  const menuButton = SITE_CONFIG.controls.showSiteMenu
    ? `<button id="menu-toggle" class="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[#f2f2f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" type="button" aria-label="Toggle navigation" aria-expanded="true">
          <i data-lucide="menu" class="h-6 w-6"></i>
        </button>`
    : "";
  const optionalButton = (show, label, icon) => !show ? "" : label === headerConfig.notificationsLabel
    ? `<a href="${appUrl("updates/")}" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" aria-label="${label}" title="${label}"><i data-lucide="${icon}" class="h-5 w-5"></i></a>`
    : `<button id="theme-cycle" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" type="button" aria-label="Change theme" title="Theme: light, dark, or system"><i data-lucide="sun-moon" class="h-5 w-5"></i></button>`;

  const header = `
    <header class="${SITE_CONFIG.controls.stickyHeader ? "fixed" : "absolute"} inset-x-0 top-0 z-50 flex h-16 items-center bg-white px-6 max-[620px]:h-14 max-[620px]:px-3">
      <div class="flex basis-[240px] items-center gap-4 max-[900px]:basis-[185px] max-[620px]:basis-auto max-[620px]:grow max-[620px]:gap-2">
        ${menuButton}
        <a class="whitespace-nowrap text-[19px] font-extrabold tracking-[-0.8px] text-[#0f0f0f] no-underline max-[620px]:text-[17px]" href="${appUrl("./")}" aria-label="${SITE_CONFIG.name} home">
          ${SITE_CONFIG.name}
        </a>
      </div>
      <div class="flex min-w-0 flex-1 items-center justify-center max-[620px]:flex-none">
        ${headerConfig.showSearch ? `<form id="site-search-form" class="site-search-form" role="search" autocomplete="off">
          <div class="site-search-control">
            <input id="site-search" class="site-search-input" type="search" aria-label="${headerConfig.searchLabel}" aria-autocomplete="list" aria-controls="site-search-results" aria-expanded="false" placeholder="${headerConfig.searchPlaceholder}" title="Search SPRK pages (/ or Ctrl+K)">
            <button class="site-search-button" type="submit" aria-label="${headerConfig.searchLabel}" title="${headerConfig.searchLabel}">
              <i data-lucide="search" class="h-5 w-5"></i>
            </button>
          </div>
          <div id="site-search-results" class="site-search-results" aria-label="Matching SPRK pages" hidden></div>
        </form>` : ""}
      </div>
      <div class="ml-5 flex basis-[240px] items-center justify-end gap-2 max-[900px]:basis-[150px] max-[900px]:ml-3 max-[620px]:ml-1 max-[620px]:basis-auto">
        ${optionalButton(headerConfig.showCreateButton, headerConfig.createLabel, "plus")}
        ${optionalButton(headerConfig.showNotificationsButton, headerConfig.notificationsLabel, "bell")}
        <button id="shortcuts-open" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><i data-lucide="keyboard" class="h-5 w-5"></i></button>
        ${profileControl}
      </div>
    </header>`;

  const sidebar = `
    <aside id="sidebar" class="fixed top-16 bottom-0 left-0 z-40 w-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-3 py-4 transition-[width,transform] duration-200 max-[900px]:w-[76px] max-[900px]:px-1 max-[620px]:top-14">
      <nav aria-label="Main navigation">
        <div class="sidebar-group">
          <div class="sidebar-section-heading max-[900px]:hidden">${sidebarConfig.primarySectionTitle}</div>
          ${SITE_CONFIG.navigation.map((link) => navLink(link, true)).join("")}
        </div>
        <div class="sidebar-group">
          <div class="sidebar-section-heading flex h-10 items-center gap-2 px-3 text-base font-semibold max-[900px]:hidden"><span>${sidebarConfig.personalSectionTitle}</span><i data-lucide="chevron-right" class="h-[18px] w-[18px]"></i></div>
          ${sidebarConfig.personalLinks.map((link) => navLink(link, true)).join("")}
        </div>
        <div class="sidebar-group">
          <div class="sidebar-section-heading flex h-10 items-center px-3 text-xs font-semibold uppercase tracking-wide text-[#606060] max-[900px]:hidden">${sidebarConfig.personalizationTitle}</div>
          ${sidebarConfig.personalizationLinks.map((link) => navLink(link, true)).join("")}
        </div>
      </nav>
      <footer class="px-3 pt-4 text-xs leading-[1.55] text-[#606060] max-[900px]:hidden">
        ${sidebarConfig.footerGroups.map((group) => `<p class="mb-3">${group.map(({ label, path }) => `<a class="mr-1 font-semibold text-inherit no-underline" href="${appUrl(path)}">${label}</a>`).join("")}</p>`).join("")}
        <p>© ${sidebarConfig.copyrightYear} ${SITE_CONFIG.name}</p>
        <p>Made with ❤️ by Shashank Pathak</p>
      </footer>
    </aside>`;
  const sidebarBackdrop = '<button id="sidebar-backdrop" type="button" aria-label="Close navigation" tabindex="-1"></button>';

  const shortcutsDialog = `
    <dialog id="shortcuts-dialog" class="shortcuts-dialog" aria-labelledby="shortcuts-heading">
      <div class="shortcuts-dialog-header">
        <h2 id="shortcuts-heading">Keyboard shortcuts</h2>
        <button id="shortcuts-close" type="button" aria-label="Close keyboard shortcuts">×</button>
      </div>
      <dl>
        <div><dt>Focus search</dt><dd><kbd>/</kbd> or <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></dd></div>
        <div><dt>Go to Home</dt><dd><kbd>Alt</kbd> + <kbd>1</kbd></dd></div>
        <div><dt>Go to Updates</dt><dd><kbd>Alt</kbd> + <kbd>2</kbd></dd></div>
        <div><dt>Go to Account</dt><dd><kbd>Alt</kbd> + <kbd>3</kbd></dd></div>
        <div><dt>Go to Theme</dt><dd><kbd>Alt</kbd> + <kbd>4</kbd></dd></div>
        <div><dt>Show this help</dt><dd><kbd>?</kbd></dd></div>
      </dl>
    </dialog>`;
  main.insertAdjacentHTML("beforebegin", header + (SITE_CONFIG.controls.showSiteMenu ? sidebarBackdrop + sidebar : "") + shortcutsDialog);
  initializeHeaderProfile().catch((error) => console.error("Could not load the signed-in profile for the header.", error));
  document.querySelectorAll("[data-site-link]").forEach((anchor) => {
    const link = linksByKey.get(anchor.dataset.siteLink);
    if (link) anchor.href = appUrl(link.path);
  });
  main.classList.add("min-h-screen", "bg-white", "transition-[margin]", "duration-200");
  const updateMainTopOffset = () => {
    if (SITE_CONFIG.controls.stickyHeader) {
      main.style.marginTop = mobileLayout.matches ? "3.5rem" : "4rem";
    } else {
      main.style.removeProperty("margin-top");
    }
  };
  updateMainTopOffset();
  mobileLayout.addEventListener("change", updateMainTopOffset);
  if (window.lucide) lucide.createIcons();

  const menuToggles = document.querySelectorAll("#menu-toggle");
  const sidebarElement = document.querySelector("#sidebar");
  const sidebarBackdropElement = document.querySelector("#sidebar-backdrop");
  const compactLayout = window.matchMedia("(max-width: 900px)");

  function setSidebarState() {
    if (!mobileLayout.matches) document.body.classList.remove("mobile-sidebar-open");
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    const mobileOpen = document.body.classList.contains("mobile-sidebar-open");
    const expanded = mobileLayout.matches ? mobileOpen : !collapsed;
    menuToggles.forEach((button) => button.setAttribute("aria-expanded", String(expanded)));
    menuToggles.forEach((button) => {
      const label = mobileLayout.matches
        ? mobileOpen ? "Close navigation" : "Open navigation"
        : collapsed ? "Expand navigation" : "Collapse navigation";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });

    if (!sidebarElement) return;
    if (mobileLayout.matches) {
      sidebarElement.style.width = "min(288px, calc(100vw - 56px))";
      sidebarElement.style.transform = mobileOpen ? "translateX(0)" : "translateX(-100%)";
      main.style.marginLeft = "0";
      if (sidebarBackdropElement) sidebarBackdropElement.hidden = !mobileOpen;
      return;
    }

    if (sidebarBackdropElement) sidebarBackdropElement.hidden = true;
    if (compactLayout.matches) {
      sidebarElement.style.width = "76px";
      main.style.marginLeft = collapsed ? "0" : "76px";
      sidebarElement.classList.toggle("-translate-x-full", collapsed);
      return;
    }

    sidebarElement.classList.remove("-translate-x-full");
    sidebarElement.style.width = collapsed ? "76px" : "256px";
    main.style.marginLeft = collapsed ? "76px" : "256px";
  }

  menuToggles.forEach((button) => button.addEventListener("click", () => {
    if (mobileLayout.matches) document.body.classList.toggle("mobile-sidebar-open");
    else {
      document.body.classList.toggle("sidebar-collapsed");
      try {
        localStorage.setItem(sidebarPreferenceKey, String(document.body.classList.contains("sidebar-collapsed")));
      } catch (error) {
        console.error("Could not save the sidebar preference.", error);
      }
    }
    setSidebarState();
  }));
  sidebarBackdropElement?.addEventListener("click", () => {
    document.body.classList.remove("mobile-sidebar-open");
    setSidebarState();
  });
  sidebarElement?.querySelectorAll(".nav-link, footer a").forEach((link) => link.addEventListener("click", () => {
    if (!mobileLayout.matches) return;
    document.body.classList.remove("mobile-sidebar-open");
    setSidebarState();
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileLayout.matches && document.body.classList.contains("mobile-sidebar-open")) {
      document.body.classList.remove("mobile-sidebar-open");
      setSidebarState();
      menuToggles[0]?.focus();
    }
  });
  compactLayout.addEventListener("change", setSidebarState);
  mobileLayout.addEventListener("change", setSidebarState);
  window.addEventListener("resize", setSidebarState);
  setSidebarState();

  const searchForm = document.querySelector('form[role="search"]');
  const searchInput = document.querySelector("#site-search");
  const searchResults = document.querySelector("#site-search-results");
  let visibleSearchPages = [];
  let activeSearchIndex = -1;
  const normalizeSearchText = (value) => String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const editDistance = (first, second) => {
    const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let row = 1; row <= first.length; row += 1) {
      let diagonal = previous[0];
      previous[0] = row;
      for (let column = 1; column <= second.length; column += 1) {
        const above = previous[column];
        previous[column] = Math.min(
          previous[column] + 1,
          previous[column - 1] + 1,
          diagonal + (first[row - 1] === second[column - 1] ? 0 : 1),
        );
        diagonal = above;
      }
    }
    return previous[second.length];
  };
  const scoreSearchPage = (entry, query) => {
    const terms = normalizeSearchText(`${entry.label} ${entry.title} ${entry.path.replace(/\.html$/, "").replace(/\//g, " ")} ${entry.path.replace(/\//g, " ")} ${(entry.terms || []).join(" ")}`);
    const words = terms.split(" ");
    if (terms === query) return 1000;
    if (terms.startsWith(query)) return 900;
    if (terms.includes(query)) return 800;
    const queryWords = query.split(" ");
    let score = 0;
    for (const queryWord of queryWords) {
      if (words.includes(queryWord)) {
        score += 140;
        continue;
      }
      if (words.some((word) => word.startsWith(queryWord))) {
        score += 110;
        continue;
      }
      const closestDistance = words.reduce((closest, word) =>
        Math.min(closest, queryWord.length >= 4 ? editDistance(queryWord, word) : Infinity), Infinity);
      if (closestDistance <= (queryWord.length > 6 ? 2 : 1)) score += 70;
      else return 0;
    }
    return score;
  };
  const searchPages = (query) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];
    return SITE_CONFIG.searchPages
      .map((entry) => ({ entry, score: scoreSearchPage(entry, normalizedQuery) }))
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score || first.entry.label.localeCompare(second.entry.label))
      .slice(0, 10)
      .map(({ entry }) => entry);
  };
  const renderSearchResults = (query) => {
    if (!searchResults || !searchInput) return;
    visibleSearchPages = searchPages(query);
    activeSearchIndex = -1;
    searchInput.removeAttribute("aria-activedescendant");
    if (!query.trim()) {
      searchResults.hidden = true;
      searchResults.replaceChildren();
      searchInput.setAttribute("aria-expanded", "false");
      return;
    }
    searchResults.setAttribute("role", visibleSearchPages.length ? "listbox" : "status");
    searchResults.innerHTML = visibleSearchPages.length
      ? visibleSearchPages.map((entry, index) => `<a id="site-search-option-${index}" class="site-search-result" role="option" aria-selected="false" href="${escapeHtml(appUrl(entry.path))}">
          <span class="site-search-result-icon"><i data-lucide="file-text" class="h-4 w-4"></i></span>
          <span class="site-search-result-copy"><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.title)} · ${escapeHtml(entry.path)}</small></span>
          <i data-lucide="arrow-up-right" class="site-search-result-arrow h-4 w-4"></i>
        </a>`).join("")
      : `<div class="site-search-empty">No matching pages or HTML files found.</div>`;
    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    if (window.lucide) lucide.createIcons();
  };
  const setActiveSearchResult = (index) => {
    if (!visibleSearchPages.length || !searchResults || !searchInput) return;
    activeSearchIndex = (index + visibleSearchPages.length) % visibleSearchPages.length;
    searchResults.querySelectorAll('[role="option"]').forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === activeSearchIndex));
    });
    searchInput.setAttribute("aria-activedescendant", `site-search-option-${activeSearchIndex}`);
  };
  try {
    const savedTheme = JSON.parse(localStorage.getItem(SITE_CONFIG.theme.storageKey) || "{}");
    const themeButton = document.querySelector("#theme-cycle");
    if (themeButton && savedTheme.appearance) {
      themeButton.setAttribute("aria-label", `Theme: ${savedTheme.appearance}`);
      themeButton.setAttribute("title", `Theme: ${savedTheme.appearance} (click to change)`);
    }
  } catch { /* Keep the default theme control usable if storage is blocked. */ }
  const shortcutsDialogElement = document.querySelector("#shortcuts-dialog");
  const openShortcuts = () => {
    if (shortcutsDialogElement && !shortcutsDialogElement.open) shortcutsDialogElement.showModal();
  };
  document.querySelector("#shortcuts-open")?.addEventListener("click", openShortcuts);
  document.querySelector("#shortcuts-close")?.addEventListener("click", () => shortcutsDialogElement?.close());
  shortcutsDialogElement?.addEventListener("click", (event) => {
    if (event.target === shortcutsDialogElement) shortcutsDialogElement.close();
  });

  searchInput?.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && visibleSearchPages.length) {
      event.preventDefault();
      setActiveSearchResult(activeSearchIndex + 1);
    } else if (event.key === "ArrowUp" && visibleSearchPages.length) {
      event.preventDefault();
      setActiveSearchResult(activeSearchIndex < 0 ? visibleSearchPages.length - 1 : activeSearchIndex - 1);
    } else if (event.key === "Escape" && searchResults && !searchResults.hidden) {
      event.preventDefault();
      searchResults.hidden = true;
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.removeAttribute("aria-activedescendant");
    }
  });
  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (mobileLayout.matches && !searchForm.classList.contains("search-expanded")) {
      searchForm.classList.add("search-expanded");
      searchInput?.focus();
      return;
    }
    const query = searchInput?.value.trim();
    if (!query) {
      searchInput?.focus();
      return;
    }
    const destination = visibleSearchPages[activeSearchIndex] || visibleSearchPages[0];
    if (destination) window.location.assign(appUrl(destination.path));
    else renderSearchResults(query);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (event.key === "Escape" && shortcutsDialogElement?.open) {
      event.preventDefault();
      shortcutsDialogElement.close();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (mobileLayout.matches) searchForm?.classList.add("search-expanded");
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping && !shortcutsDialogElement?.open) {
      event.preventDefault();
      if (mobileLayout.matches) searchForm?.classList.add("search-expanded");
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (event.altKey && ["1", "2", "3", "4"].includes(event.key)) {
      const destinations = {
        "1": "./",
        "2": "updates/",
        "3": "account/",
        "4": "theme/",
      };
      event.preventDefault();
      window.location.assign(appUrl(destinations[event.key]));
      return;
    }
    if (!isTyping && event.key === "?") {
      event.preventDefault();
      openShortcuts();
    }
  });
})();
