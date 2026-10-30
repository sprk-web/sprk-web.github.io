export const SITE_CONFIG = {
  name: "SPRK-Web",
  pageTitles: {
    home: "SPRK-Web",
    simulations: "Simulations - SPRK-Web",
    account: "Your account - SPRK-Web",
    updates: "Updates - SPRK-Web",
    support: "Contact support - SPRK-Web",
    community: "Community - SPRK-Web",
    syllabus_tracker: "Syllabus Tracker - SPRK-Web",
    question_log: "Error Question Log - SPRK-Web",
    quests: "Daily Goals - SPRK-Web",
    admin: "SPRK Admin",
    theme: "Theme & personalization - SPRK WEB",
    notFound: "Page not found - SPRK-Web",
  },
  navigation: [
    { key: "home", label: "Home", icon: "house", path: "./" },
    { key: "simulations", label: "Simulations", icon: "atom", path: "simulator/" },
    { key: "updates", label: "Updates", icon: "bell", path: "updates/" },
    { key: "syllabus_tracker", label: "Syllabus Tracker", icon: "book-check", path: "syllabus_tracker/" },
    { key: "question_log", label: "Error Log", icon: "notebook-pen", path: "error_log/" },
    { key: "quests", label: "Daily Goals", icon: "list-todo", path: "quests/" },
    { key: "community", label: "Community", icon: "messages-circle", path: "community/" },
  ],
  searchPages: [
    { label: "Home", title: "SPRK-Web", path: "./", terms: ["start", "homepage", "learning", "explore"] },
    { label: "Simulations", title: "Explore simulations", path: "simulator/", terms: ["simulator", "physics", "experiments", "learning lab"] },
    { label: "Updates", title: "What’s new", path: "updates/", terms: ["news", "announcements", "releases", "posts"] },
    { label: "Community", title: "Public study forums", path: "community/", terms: ["study forum", "groups", "discussion", "questions", "communities"] },
    { label: "Syllabus Tracker", title: "JEE syllabus progress", path: "syllabus_tracker/", terms: ["jee", "jee mains", "jee advanced", "syllabus", "checkpoints", "revision", "prep", "ascent"] },
    { label: "Error Question Log", title: "Review and organize difficult questions", path: "error_log/", terms: ["error log", "question log", "mistakes", "priority", "difficulty", "revision"] },
    { label: "Daily Goals", title: "Study goals and leaderboard", path: "quests/", terms: ["daily goals", "planner", "study tasks", "focus timer", "leaderboard", "xp", "quests"] },
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
      { key: "support", label: "Contact support", icon: "shield-user", path: "support/" },
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
    url: "https://esknzhyvlzxxgylkczyl.supabase.co",
    anonKey: "sb_publishable_EvzkMnOeun31lX40-_pkBA_q2Nyuj4-",
  },
  appData: {
    url: "https://zbtmfqxdumwwabigcumv.supabase.co",
    anonKey: "sb_publishable_tbmZiB9hqcQ80v1MHfZqwg_HaQXstcO",
  },
};

export const SUPABASE_URL = SUPABASE_PROJECTS.main.url;
export const SUPABASE_ANON_KEY = SUPABASE_PROJECTS.main.anonKey;
export const APP_DATA_SUPABASE_URL = SUPABASE_PROJECTS.appData.url;
export const APP_DATA_SUPABASE_ANON_KEY = SUPABASE_PROJECTS.appData.anonKey;
