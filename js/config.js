export const SITE_CONFIG = {
  name: "SPRK-Web",
  pageTitles: {
    home: "SPRK-Web",
    simulations: "Simulations - SPRK-Web",
    account: "Your account - SPRK-Web",
    updates: "Updates - SPRK-Web",
    support: "Contact support - SPRK-Web",
    community: "Community - SPRK-Web",
    admin: "SPRK Admin",
    theme: "Theme & personalization - SPRK WEB",
    notFound: "Page not found - SPRK-Web",
  },
  navigation: [
    { key: "home", label: "Home", icon: "house", path: "./" },
    { key: "simulations", label: "Simulations", icon: "orbit", path: "simulator/" },
    { key: "updates", label: "Updates", icon: "bell", path: "updates/" },
    { key: "community", label: "Community", icon: "users-round", path: "community/" },
  ],
  searchPages: [
    { label: "Home", title: "SPRK-Web", path: "./", terms: ["start", "homepage", "learning", "explore"] },
    { label: "Simulations", title: "Explore simulations", path: "simulator/", terms: ["simulator", "physics", "experiments", "learning lab"] },
    { label: "Updates", title: "What’s new", path: "updates/", terms: ["news", "announcements", "releases", "posts"] },
    { label: "Community", title: "Community chat", path: "community/", terms: ["groups", "chat", "communities", "inbox"] },
    { label: "Contact Us", title: "Contact SPRK support", path: "support/", terms: ["complaint", "help", "support ticket", "report a problem"] },
    { label: "Your account", title: "Your account", path: "account/", terms: ["profile", "sign in", "login", "member"] },
    { label: "Theme", title: "Theme & personalization", path: "theme/", terms: ["settings", "appearance", "colors", "personalize"] },
    { label: "Admin", title: "SPRK Admin", path: "admin/", terms: ["dashboard", "management"] },
    { label: "Post updates", title: "Manage updates", path: "admin/post-updates/", terms: ["admin", "publish", "editor", "announcements"] },
    { label: "Traffic analytics", title: "Traffic analytics", path: "admin/traffic/", terms: ["admin", "insights", "visitors", "popular pages"] },
    { label: "Page not found", title: "404", path: "404.html", terms: ["not found", "error", "404"] },
  ],
  sidebar: {
    primarySectionTitle: "Discover",
    personalSectionTitle: "Your space",
    personalLinks: [
      { key: "account", label: "Your account", icon: "user-round", path: "account/" },
      { key: "support", label: "Contact support", icon: "life-buoy", path: "support/" },
    ],
    personalizationTitle: "Personalization",
    personalizationLinks: [
      { key: "theme", label: "Theme", icon: "palette", path: "theme/" },
    ],
    footerGroups: [
      [
        { label: "About", path: "#" },
        { label: "Copyright", path: "#" },
        { label: "Contact", path: "#" },
      ],
      [
        { label: "Privacy", path: "#" },
        { label: "Help", path: "#" },
      ],
    ],
    copyrightYear: 2026,
  },
  header: {
    searchPlaceholder: "Search pages and files",
    searchLabel: "Search",
    createLabel: "Create",
    notificationsLabel: "Notifications",
    accountLabel: "Account",
    showSearch: true,
    showCreateButton: false,
    showNotificationsButton: true,
    showAccountButton: true,
  },
  controls: {
    showSiteMenu: true,
    showMainAuth: true,
    showThemeSelector: true,
    showAccentPicker: true,
    stickyHeader: true,
  },
  theme: {
    storageKey: "sprk-theme-preferences",
    preferences: {
      appearance: "system",
      accent: "#2563eb",
      font: "system",
      fontSize: "16",
      density: "comfortable",
      panelStyle: "classic",
      pageTone: "neutral",
      rounded: true,
      reducedMotion: false,
    },
    fonts: {
      system: { label: "System sans-serif", family: "Arial, sans-serif" },
      rounded: { label: "Rounded", family: "Trebuchet MS, sans-serif" },
      serif: { label: "Serif", family: "Georgia, serif" },
      mono: { label: "Monospaced", family: "Consolas, monospace" },
    },
    appearanceOptions: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "system", label: "Use device setting" },
    ],
    densityOptions: [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" },
    ],
    panelStyleOptions: [
      { value: "classic", label: "Classic" },
      { value: "soft", label: "Soft tint" },
      { value: "raised", label: "Elevated" },
    ],
    pageToneOptions: [
      { value: "neutral", label: "Neutral" },
      { value: "warm", label: "Warm" },
      { value: "cool", label: "Cool" },
    ],
    fontSize: { min: 14, max: 20, step: 1 },
  },
};

export const SIMULATOR_CONFIG = {
  categories: [
    "Mechanics",
    "Rotational Motion",
    "Work, Power & Energy",
    "Gravitation",
    "Oscillations and Waves",
    "Thermodynamics",
    "Electrostatics",
    "Current Electricity",
    "Magnetism",
    "Optics",
    "Modern Physics",
    "Fluid Mechanics",
    "General Physics",
    "Other",
  ],
  difficulties: [
    "Beginner",
    "Intermediate",
    "Advanced",
    "JEE Main",
    "JEE Advanced",
    "NEET",
    "Undergraduate",
  ],
  supabaseClientUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
};

// Browser-facing configuration only. Never put a service-role or secret key here.
export const SUPABASE_PROJECTS = {
  main: {
    url: "https://eliwtvmovfykydbhbgvs.supabase.co",
    anonKey: "sb_publishable_TrXEA94Ci3GzcVHf-votMw_0Yxrl-BT",
  },
  simulator: {
    url: "https://owguhymyzrwawibzetxd.supabase.co",
    anonKey: "sb_publishable_43f9RoG0zdAtfS8_h5B4KQ_o2gm8MbO",
  },
};

export const ADMIN_EMAILS = ["shashankkk16@gmail.com"];
export const SUPABASE_URL = SUPABASE_PROJECTS.main.url;
export const SUPABASE_ANON_KEY = SUPABASE_PROJECTS.main.anonKey;
export const SIMULATOR_SUPABASE_URL = SUPABASE_PROJECTS.simulator.url;
export const SIMULATOR_SUPABASE_ANON_KEY = SUPABASE_PROJECTS.simulator.anonKey;
