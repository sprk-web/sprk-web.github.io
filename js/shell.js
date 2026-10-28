import { SITE_CONFIG } from "./config.js";

(() => {
  const appUrl = (path) => path.startsWith("#")
    ? path
    : new URL(path, new URL("../", import.meta.url)).href;
  const page = document.body.dataset.page || "home";
  const main = document.querySelector("main");
  if (!main) throw new Error("The shared SPRK shell requires a <main> element.");
  document.title = SITE_CONFIG.pageTitles[page] || SITE_CONFIG.name;

  const navLink = ({ key, label, icon, path }, compact = false) => `
    <a class="nav-link flex min-h-10 items-center gap-6 rounded-[10px] px-3 text-sm no-underline hover:bg-[#f2f2f2] ${compact ? "max-[900px]:min-h-[68px] max-[900px]:flex-col max-[900px]:justify-center max-[900px]:gap-1.5 max-[900px]:px-0 max-[900px]:py-1 max-[900px]:text-[10px]" : ""}" href="${appUrl(path)}"${page === key ? ' aria-current="page"' : ""}>
      <i data-lucide="${icon}" class="h-6 w-6 shrink-0"></i><span class="nav-label">${label}</span>
    </a>`;

  const headerConfig = SITE_CONFIG.header;
  const sidebarConfig = SITE_CONFIG.sidebar;
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
    ? `<a href="${appUrl("updates/index.html")}" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" aria-label="${label}" title="${label}"><i data-lucide="${icon}" class="h-5 w-5"></i></a>`
    : `<button id="theme-cycle" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" type="button" aria-label="Change theme" title="Theme: light, dark, or system"><i data-lucide="sun-moon" class="h-5 w-5"></i></button>`;

  const header = `
    <header class="${SITE_CONFIG.controls.stickyHeader ? "fixed" : "absolute"} inset-x-0 top-0 z-50 flex h-16 items-center bg-white px-6 max-[620px]:h-14 max-[620px]:px-3">
      <div class="flex basis-[240px] items-center gap-4 max-[900px]:basis-[185px] max-[620px]:basis-auto max-[620px]:grow max-[620px]:gap-2">
        ${menuButton}
        <a class="whitespace-nowrap text-[19px] font-extrabold tracking-[-0.8px] text-[#0f0f0f] no-underline max-[620px]:text-[17px]" href="${appUrl("index.html")}" aria-label="${SITE_CONFIG.name} home">
          ${SITE_CONFIG.name}
        </a>
      </div>
      <div class="flex min-w-0 flex-1 items-center justify-center max-[620px]:flex-none">
        ${headerConfig.showSearch ? `<form class="flex h-10 w-full max-w-[640px] overflow-hidden rounded-full border border-[#c6c6c6] shadow-[inset_0_1px_2px_#eee] focus-within:border-[#1c62b9] max-[620px]:w-10 max-[620px]:justify-end max-[620px]:border-0 max-[620px]:shadow-none" role="search" action="https://www.google.com/search" method="get">
          <input id="site-search" name="q" class="h-full w-full min-w-0 bg-transparent px-4 text-base outline-none placeholder:text-[#777]" type="search" aria-label="${headerConfig.searchLabel}" placeholder="${headerConfig.searchPlaceholder}" title="Search the web (Ctrl+K)">
          <button class="grid h-full basis-16 shrink-0 place-items-center border-l border-[#c6c6c6] bg-[#f8f8f8] hover:bg-[#f0f0f0] max-[620px]:h-10 max-[620px]:w-10 max-[620px]:basis-10 max-[620px]:rounded-full max-[620px]:border-0 max-[620px]:bg-transparent" type="submit" aria-label="${headerConfig.searchLabel}">
            <i data-lucide="search" class="h-[22px] w-[22px]"></i>
          </button>
        </form>` : ""}
      </div>
      <div class="ml-5 flex basis-[240px] items-center justify-end gap-2 max-[900px]:basis-[150px] max-[900px]:ml-3 max-[620px]:ml-1 max-[620px]:basis-auto">
        ${optionalButton(headerConfig.showCreateButton, headerConfig.createLabel, "plus")}
        ${optionalButton(headerConfig.showNotificationsButton, headerConfig.notificationsLabel, "bell")}
        <button id="shortcuts-open" class="grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><i data-lucide="keyboard" class="h-5 w-5"></i></button>
        ${SITE_CONFIG.controls.showMainAuth && headerConfig.showAccountButton ? `<a id="auth-button" href="${appUrl("account/index.html")}" class="ml-1 grid h-10 w-10 place-items-center rounded-full hover:bg-[#f2f2f2]" aria-label="${headerConfig.accountLabel}" title="Login / account"><i data-lucide="user-round" class="h-5 w-5"></i></a>` : ""}
      </div>
    </header>`;

  const sidebar = `
    <aside id="sidebar" class="fixed top-16 bottom-0 left-0 z-40 w-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white px-3 py-3 transition-[width,transform] duration-200 max-[900px]:w-[72px] max-[900px]:px-1 max-[620px]:top-14">
      <nav aria-label="Main navigation">
        <div class="border-b border-[#e5e5e5] pb-3 max-[900px]:border-0 max-[900px]:pb-2">
          ${SITE_CONFIG.navigation.map((link) => navLink(link, true)).join("")}
        </div>
        <div class="border-b border-[#e5e5e5] py-3 max-[900px]:border-0 max-[900px]:py-0">
          <div class="sidebar-section-heading flex h-10 items-center gap-2 px-3 text-base font-semibold max-[900px]:hidden"><span>${sidebarConfig.personalSectionTitle}</span><i data-lucide="chevron-right" class="h-[18px] w-[18px]"></i></div>
          ${sidebarConfig.personalLinks.map((link) => navLink(link, true)).join("")}
        </div>
        <div class="py-3">
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

  const shortcutsDialog = `
    <dialog id="shortcuts-dialog" class="shortcuts-dialog" aria-labelledby="shortcuts-heading">
      <div class="shortcuts-dialog-header">
        <h2 id="shortcuts-heading">Keyboard shortcuts</h2>
        <button id="shortcuts-close" type="button" aria-label="Close keyboard shortcuts">×</button>
      </div>
      <dl>
        <div><dt>Focus search</dt><dd><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd></dd></div>
        <div><dt>Go to Home</dt><dd><kbd>Alt</kbd> + <kbd>1</kbd></dd></div>
        <div><dt>Go to Updates</dt><dd><kbd>Alt</kbd> + <kbd>2</kbd></dd></div>
        <div><dt>Go to Account</dt><dd><kbd>Alt</kbd> + <kbd>3</kbd></dd></div>
        <div><dt>Go to Theme</dt><dd><kbd>Alt</kbd> + <kbd>4</kbd></dd></div>
        <div><dt>Show this help</dt><dd><kbd>?</kbd></dd></div>
      </dl>
    </dialog>`;
  main.insertAdjacentHTML("beforebegin", header + (SITE_CONFIG.controls.showSiteMenu ? sidebar : "") + shortcutsDialog);
  document.querySelectorAll("[data-site-link]").forEach((anchor) => {
    const link = linksByKey.get(anchor.dataset.siteLink);
    if (link) anchor.href = appUrl(link.path);
  });
  main.classList.add("min-h-screen", "bg-white", "transition-[margin]", "duration-200");
  if (SITE_CONFIG.controls.stickyHeader) main.classList.add("mt-16", "max-[620px]:mt-14");
  if (window.lucide) lucide.createIcons();

  const menuToggles = document.querySelectorAll("#menu-toggle");
  const sidebarElement = document.querySelector("#sidebar");
  const compactLayout = window.matchMedia("(max-width: 900px)");
  const mobileLayout = window.matchMedia("(max-width: 620px)");

  function setSidebarState() {
    const collapsed = document.body.classList.contains("sidebar-collapsed");
    menuToggles.forEach((button) => button.setAttribute("aria-expanded", String(!collapsed)));

    if (!sidebarElement) return;
    if (mobileLayout.matches) {
      sidebarElement.style.width = "72px";
      main.style.marginLeft = collapsed ? "0" : "72px";
      sidebarElement.classList.toggle("-translate-x-full", collapsed);
      return;
    }

    sidebarElement.classList.remove("-translate-x-full");
    if (compactLayout.matches) {
      sidebarElement.style.width = "72px";
      main.style.marginLeft = "72px";
      return;
    }

    sidebarElement.style.width = collapsed ? "72px" : "240px";
    main.style.marginLeft = collapsed ? "72px" : "240px";
  }

  menuToggles.forEach((button) => button.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
    setSidebarState();
  }));
  compactLayout.addEventListener("change", setSidebarState);
  mobileLayout.addEventListener("change", setSidebarState);
  setSidebarState();

  const searchForm = document.querySelector('form[role="search"]');
  const searchInput = document.querySelector("#site-search");
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

    const normalizedQuery = query.toLowerCase();
    const destinations = [
      { terms: ["home", "homepage", "start"], path: "index.html" },
      { terms: ["update", "updates", "news", "announcement"], path: "updates/index.html" },
      { terms: ["account", "profile", "login", "sign in"], path: "account/index.html" },
      { terms: ["theme", "appearance", "personalization", "personalisation", "settings"], path: "theme/index.html" },
    ];
    const destination = destinations.find(({ terms }) =>
      terms.some((term) => normalizedQuery.includes(term)),
    );
    if (destination) {
      window.location.assign(appUrl(destination.path));
      return;
    }

    window.location.assign(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
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
    if (event.altKey && ["1", "2", "3", "4"].includes(event.key)) {
      const destinations = {
        "1": "index.html",
        "2": "updates/index.html",
        "3": "account/index.html",
        "4": "theme/index.html",
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
