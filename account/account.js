import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

const app = document.querySelector("#account-app");
const clientUrl = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let db;

function showMessage(text, kind = "success") {
  const status = document.querySelector("#status");
  if (!status) return;
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(form, busy, pendingLabel) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = pendingLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

function compressAvatar(file) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Choose an image file for your profile picture."));
  }
  if (file.size > 10 * 1024 * 1024) {
    return Promise.reject(new Error("Choose an image smaller than 10 MB."));
  }

  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      URL.revokeObjectURL(sourceUrl);
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Your browser could not process this image."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try {
        const blob = await new Promise((resolveBlob, rejectBlob) => {
          canvas.toBlob((result) => {
            if (result) resolveBlob(result);
            else rejectBlob(new Error("Could not compress this image."));
          }, "image/jpeg", 0.82);
        });
        resolve(blob);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("This image could not be opened. Try a JPEG, PNG, or WebP image."));
    };
    image.src = sourceUrl;
  });
}

function avatarPathFromUrl(url) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  try {
    const pathname = new URL(url).pathname;
    const index = pathname.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function passwordMarkup(id, name, label, autocomplete, required = true) {
  return `<div class="account-field">
    <label for="${id}">${label}</label>
    <span class="account-password-wrap">
      <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" ${autocomplete === "new-password" ? 'minlength="8"' : ""} ${required ? "required" : ""}>
      <button class="account-password-toggle" type="button" data-password-toggle="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false"><i data-lucide="eye" class="h-4 w-4"></i></button>
    </span>
  </div>`;
}

function render(user = null, profile = {}) {
  const displayName = profile.display_name || "";
  const initial = (displayName || user?.email || "S").slice(0, 1).toUpperCase();
  const avatar = profile.avatar_url
    ? `<img src="${escapeHtml(profile.avatar_url)}" alt="Profile picture">`
    : `<span aria-hidden="true">${escapeHtml(initial)}</span>`;

  app.innerHTML = `<section class="account-page">
    <header class="account-heading">
      <p class="account-eyebrow"><i data-lucide="user-round" class="h-4 w-4"></i> Personal space</p>
      <h1>${user ? "Your account" : "Welcome to SPRK-Web"}</h1>
      <p>${user ? "Your profile and sign-in settings, all in one place." : "Sign in to pick up where you left off, or create an account to get started."}</p>
    </header>

    ${user ? `
      <section class="account-panel">
        <div class="account-profile-header">
          <div class="account-identity">
            <div id="avatar-frame" class="account-avatar">${avatar}</div>
            <div>
              <h2 id="account-display-name">${escapeHtml(displayName || "Welcome")}</h2>
              <p>${escapeHtml(user.email)}</p>
              <span class="account-status-badge" data-verified="${Boolean(user.email_confirmed_at)}">
                <i data-lucide="${user.email_confirmed_at ? "badge-check" : "mail"}" class="h-4 w-4"></i>
                ${user.email_confirmed_at ? "Email verified" : "Email not verified"}
              </span>
            </div>
          </div>
          <span class="account-field-hint">Member since ${user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "recently"}</span>
        </div>

        <div class="account-profile-body">
          <div class="account-profile-main">
            <div>
              <h3 class="account-section-title">Profile details</h3>
              <p class="account-section-copy">Add a name and a little about yourself so your profile feels like yours.</p>
            </div>
            <form id="profile-form" class="account-profile-form">
              <label class="account-field account-upload" for="avatar-file">
                <span id="avatar-upload-preview" class="account-avatar">${avatar}</span>
                <span class="account-field-copy">
                  <span>Profile picture</span>
                  <input id="avatar-file" class="account-file-input" type="file" accept="image/*">
                  <span class="account-field-hint">JPEG, PNG, or WebP. Resized and compressed before upload (10 MB maximum). Uploads need the avatars bucket and policies from <code>supabase-storage.sql</code>.</span>
                </span>
              </label>
              <label class="account-field" for="display-name">Display name
                <input id="display-name" name="display_name" maxlength="80" value="${escapeHtml(displayName)}" placeholder="How should we address you?">
              </label>
              <label class="account-field" for="bio">About you
                <textarea id="bio" name="bio" rows="4" maxlength="500" placeholder="A short introduction (optional)">${escapeHtml(profile.bio || "")}</textarea>
                <span class="account-row-between account-field-hint"><span>Keep it short and friendly.</span><span id="bio-count">${(profile.bio || "").length}/500</span></span>
              </label>
              <div><button class="account-primary-button" type="submit"><i data-lucide="save" class="h-4 w-4"></i> Save changes</button></div>
            </form>
          </div>

          <aside class="account-profile-sidebar">
            <div>
              <div class="account-progress-header"><strong>Profile strength</strong><span id="profile-completion-value"></span></div>
              <div class="account-progress-track" role="progressbar" aria-label="Profile completeness" aria-valuemin="0" aria-valuemax="100">
                <div id="profile-completion-bar" class="account-progress-fill"></div>
              </div>
            </div>
            <ul id="profile-checklist" class="account-checklist"></ul>
            <p class="account-footnote">Your profile details are only used to personalize your SPRK-Web experience.</p>
          </aside>
        </div>

        <section class="account-security-card">
          <div class="account-security-heading">
            <span class="account-icon-tile"><i data-lucide="shield-check" class="h-5 w-5"></i></span>
            <div><h3 class="account-section-title">Sign-in security</h3><p class="account-section-copy">Use a unique password with at least 8 characters.</p></div>
          </div>
          <div class="account-security-content">
            <form id="password-form" class="account-security-form">
              ${passwordMarkup("new-password", "password", "New password", "new-password")}
              ${passwordMarkup("confirm-password", "confirm_password", "Confirm new password", "new-password")}
              <div><button class="account-secondary-button" type="submit">Update password</button></div>
            </form>
            <div class="account-security-actions">
              <span class="account-field-hint">Signed in as ${escapeHtml(user.email)}</span>
              <button id="signout" class="account-danger-button" type="button"><i data-lucide="log-out" class="h-4 w-4"></i> Sign out</button>
            </div>
          </div>
        </section>
        <p id="status" role="status" aria-live="polite" class="account-status"></p>
      </section>
    ` : `
      <section class="account-panel account-guest">
        <div class="account-welcome">
          <div class="account-welcome-icon"><i data-lucide="sparkles" class="h-6 w-6"></i></div>
          <div class="account-welcome-copy">
            <h2>Your learning space, ready when you are.</h2>
            <p>Sign in to keep your SPRK-Web experience connected across visits.</p>
          </div>
          <ul class="account-benefit-list">
            <li><i data-lucide="check-circle-2" class="h-4 w-4"></i> Your profile, your way</li>
            <li><i data-lucide="check-circle-2" class="h-4 w-4"></i> Secure account access</li>
            <li><i data-lucide="check-circle-2" class="h-4 w-4"></i> Pick up where you left off</li>
          </ul>
        </div>
        <div class="account-auth">
          <div class="account-tabs" role="tablist" aria-label="Account access">
            <button id="signin-tab" class="account-tab" role="tab" type="button" aria-controls="signin-panel" aria-selected="true">Sign in</button>
            <button id="signup-tab" class="account-tab" role="tab" type="button" aria-controls="signup-panel" aria-selected="false">Create account</button>
          </div>
          <form id="signin" class="account-auth-form" role="tabpanel" aria-labelledby="signin-tab">
            <h2 class="account-form-heading">Welcome back</h2>
            <label class="account-field" for="signin-email">Email address
              <input id="signin-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            ${passwordMarkup("signin-password", "password", "Password", "current-password")}
            <div class="account-row-between">
              <span class="account-field-hint">Forgot your password?</span>
              <button id="forgot-password" class="account-text-button" type="button">Reset it</button>
            </div>
            <button class="account-primary-button" type="submit"><i data-lucide="log-in" class="h-4 w-4"></i> Sign in</button>
          </form>
          <form id="signup" class="account-auth-form" role="tabpanel" aria-labelledby="signup-tab" hidden>
            <h2 class="account-form-heading">Create your account</h2>
            <label class="account-field" for="signup-email">Email address
              <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            ${passwordMarkup("signup-password", "password", "Password", "new-password")}
            <div class="account-strength" aria-live="polite">
              <div class="account-strength-track"><div id="password-strength-fill" class="account-strength-fill"></div></div>
              <span id="password-strength-label" class="account-strength-label">Use at least 8 characters.</span>
            </div>
            <p class="account-field-hint">Use at least 8 characters. A mix of letters, numbers, and symbols is even better.</p>
            <button class="account-primary-button" type="submit"><i data-lucide="user-round-plus" class="h-4 w-4"></i> Create account</button>
          </form>
          <p id="status" role="status" aria-live="polite" class="account-status"></p>
          <p class="account-privacy-note"><i data-lucide="lock-keyhole" class="h-4 w-4"></i><span>Your password is handled securely by Supabase. Never share it with anyone.</span></p>
        </div>
      </section>
    `}
  </section>`;

  window.lucide?.createIcons();
  document.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
    toggle.onclick = () => {
      const input = document.getElementById(toggle.dataset.passwordToggle);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(reveal));
      toggle.setAttribute("aria-label", `${reveal ? "Hide" : "Show"} ${input.labels[0].textContent.trim()}`);
      toggle.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}" class="h-4 w-4"></i>`;
      window.lucide?.createIcons();
    };
  });

  if (!user) {
    const signinTab = document.querySelector("#signin-tab");
    const signupTab = document.querySelector("#signup-tab");
    const signinForm = document.querySelector("#signin");
    const signupForm = document.querySelector("#signup");
    const selectTab = (tab) => {
      const signingUp = tab === "signup";
      signinTab.setAttribute("aria-selected", String(!signingUp));
      signupTab.setAttribute("aria-selected", String(signingUp));
      signinForm.hidden = signingUp;
      signupForm.hidden = !signingUp;
      showMessage("");
      (signingUp ? signupForm : signinForm).querySelector("input").focus();
      if (signingUp) updatePasswordStrength();
    };
    signinTab.onclick = () => selectTab("signin");
    signupTab.onclick = () => selectTab("signup");
    document.querySelector('[role="tablist"]').onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const activeTab = document.activeElement;
      const nextTab = event.key === "Home" ? signinTab
        : event.key === "End" ? signupTab
          : activeTab === signinTab ? signupTab : signinTab;
      selectTab(nextTab === signupTab ? "signup" : "signin");
      nextTab.focus();
    };

    const signupPassword = document.querySelector("#signup-password");
    const updatePasswordStrength = () => {
      const password = signupPassword.value;
      const score = [
        password.length >= 8,
        /[a-z]/.test(password) && /[A-Z]/.test(password),
        /\d/.test(password),
        /[^A-Za-z0-9]/.test(password),
        password.length >= 12,
      ].filter(Boolean).length;
      const labels = ["Use at least 8 characters.", "Very weak", "Weak", "Fair", "Good", "Strong"];
      const fill = document.querySelector("#password-strength-fill");
      fill.style.width = `${Math.max(0, score * 20)}%`;
      fill.style.backgroundColor = score >= 4 ? "#16804a" : score >= 3 ? "#d97706" : "#dc5a4a";
      document.querySelector("#password-strength-label").textContent = password ? labels[score] : labels[0];
    };
    signupPassword.oninput = updatePasswordStrength;

    for (const [form, method, pendingLabel] of [
      [signinForm, "signInWithPassword", "Signing in…"],
      [signupForm, "signUp", "Creating account…"],
    ]) {
      form.onsubmit = async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const credentials = { email: String(data.get("email")).trim(), password: String(data.get("password")) };
        setBusy(form, true, pendingLabel);
        showMessage("Please wait while we securely connect your account.", "info");
        try {
          const { data: authData, error } = await db.auth[method](credentials);
          if (error) throw error;
          if (method === "signUp" && !authData.session) {
            form.reset();
            selectTab("signin");
            showMessage("Your account is ready. Check your email for a confirmation link.");
          } else {
            location.reload();
          }
        } catch (error) {
          showMessage(error.message || "We couldn't complete that request. Please try again.", "error");
        } finally {
          setBusy(form, false);
        }
      };
    }

    document.querySelector("#forgot-password").onclick = async () => {
      const emailInput = document.querySelector("#signin-email");
      const email = emailInput.value.trim();
      if (!email) {
        showMessage("Enter your email address above, then choose Reset it.", "error");
        emailInput.focus();
        return;
      }
      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }
      const button = document.querySelector("#forgot-password");
      button.disabled = true;
      showMessage("Sending a password reset link…", "info");
      try {
        const { error } = await db.auth.resetPasswordForEmail(email);
        if (error) throw error;
        showMessage("If an account exists for that email, a password reset link is on its way.");
      } catch (error) {
        showMessage(error.message || "The reset link could not be sent. Please try again.", "error");
      } finally {
        button.disabled = false;
      }
    };
    return;
  }

  const form = document.querySelector("#profile-form");
  let compressedAvatar = null;
  let previewUrl = null;
  const fileInput = document.querySelector("#avatar-file");
  fileInput.onchange = async () => {
    compressedAvatar = null;
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      compressedAvatar = await compressAvatar(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(compressedAvatar);
      document.querySelector("#avatar-upload-preview").innerHTML = `<img src="${previewUrl}" alt="Compressed profile picture preview">`;
      showMessage(`Picture ready to upload (${Math.ceil(compressedAvatar.size / 1024)} KB).`, "info");
    } catch (error) {
      showMessage(error.message, "error");
      fileInput.value = "";
    }
  };

  const bioInput = document.querySelector("#bio");
  bioInput.oninput = () => {
    document.querySelector("#bio-count").textContent = `${bioInput.value.length}/500`;
    updateProfileStrength();
  };
  document.querySelector("#display-name").oninput = updateProfileStrength;
  updateProfileStrength();

  function updateProfileStrength() {
    const checks = [
      ["display_name", Boolean(document.querySelector("#display-name").value.trim())],
      ["bio", Boolean(bioInput.value.trim())],
      ["avatar", Boolean(compressedAvatar || profile.avatar_url)],
    ];
    const complete = checks.filter(([, done]) => done).length;
    const percent = Math.round((complete / checks.length) * 100);
    const bar = document.querySelector("#profile-completion-bar");
    bar.style.width = `${percent}%`;
    bar.parentElement.setAttribute("aria-valuenow", String(percent));
    document.querySelector("#profile-completion-value").textContent = `${percent}%`;
    document.querySelector("#profile-checklist").innerHTML = checks.map(([key, done]) => {
      const labels = {
        display_name: done ? "Display name added" : "Add a display name",
        bio: done ? "Short bio added" : "Write a short bio",
        avatar: done ? "Profile picture added" : "Add a profile picture",
      };
      return `<li data-complete="${done}"><i data-lucide="${done ? "circle-check" : "circle"}" class="h-4 w-4"></i>${labels[key]}</li>`;
    }).join("");
    window.lucide?.createIcons();
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const avatarPath = compressedAvatar ? `${user.id}/${crypto.randomUUID()}.jpg` : null;
    let uploadedAvatarUrl = profile.avatar_url || null;
    setBusy(form, true, "Saving changes…");
    showMessage("Saving your profile…", "info");
    try {
      if (compressedAvatar) {
        const { error: uploadError } = await db.storage.from("avatars").upload(avatarPath, compressedAvatar, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) throw new Error(`Picture upload failed: ${uploadError.message}`);
        uploadedAvatarUrl = db.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl;
      }

      const nextProfile = {
        id: user.id,
        display_name: String(formData.get("display_name")).trim(),
        bio: String(formData.get("bio")).trim(),
        avatar_url: uploadedAvatarUrl,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("profiles").upsert(nextProfile);
      if (error) {
        if (avatarPath) {
          const { error: cleanupError } = await db.storage.from("avatars").remove([avatarPath]);
          if (cleanupError) throw new Error(`${error.message} The uploaded picture could not be cleaned up: ${cleanupError.message}`);
        }
        throw error;
      }

      let cleanupNotice = "";
      if (compressedAvatar) {
        const oldAvatarPath = avatarPathFromUrl(profile.avatar_url);
        if (oldAvatarPath && oldAvatarPath !== avatarPath) {
          const { error: removeError } = await db.storage.from("avatars").remove([oldAvatarPath]);
          if (removeError) cleanupNotice = ` Profile saved, but the previous picture could not be removed: ${removeError.message}`;
        }
      }
      Object.assign(profile, nextProfile);
      compressedAvatar = null;
      render(user, profile);
      showMessage(cleanupNotice ? cleanupNotice.trim() : "Your profile has been saved.", cleanupNotice ? "error" : "success");
    } catch (error) {
      showMessage(error.message || "Your profile could not be saved. Please try again.", "error");
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      setBusy(form, false);
    }
  };

  document.querySelector("#password-form").onsubmit = async (event) => {
    event.preventDefault();
    const passwordForm = event.currentTarget;
    const formData = new FormData(passwordForm);
    const password = String(formData.get("password"));
    if (password.length < 8) {
      showMessage("Choose a password with at least 8 characters.", "error");
      return;
    }
    if (password !== String(formData.get("confirm_password"))) {
      showMessage("The passwords do not match.", "error");
      return;
    }
    setBusy(passwordForm, true, "Updating password…");
    try {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      passwordForm.reset();
      showMessage("Your password has been updated.");
    } catch (error) {
      showMessage(error.message || "Your password could not be updated. Please try again.", "error");
    } finally {
      setBusy(passwordForm, false);
    }
  };

  document.querySelector("#signout").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Signing out…";
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      location.reload();
    } catch (error) {
      showMessage(error.message || "You couldn't be signed out. Please try again.", "error");
      button.disabled = false;
      button.innerHTML = '<i data-lucide="log-out" class="h-4 w-4"></i> Sign out';
      window.lucide?.createIcons();
    }
  };
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  app.innerHTML = `<section class="account-panel account-error-panel"><h1>Configuration required</h1><p>Add the public Supabase project URL and anon/publishable key in <code>js/config.js</code>.</p></section>`;
} else {
  const script = document.createElement("script");
  script.src = clientUrl;
  script.onload = async () => {
    try {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      const user = data.session?.user;
      if (!user) {
        render();
        return;
      }
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("display_name,bio,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      render(user, profile || {});
    } catch (error) {
      app.innerHTML = `<section class="account-panel account-error-panel"><h1>Account unavailable</h1><p>${escapeHtml(error.message || "Could not connect to Supabase.")}</p><p>Check your project URL, key, network connection, and SQL setup.</p></section>`;
    }
  };
  script.onerror = () => {
    app.innerHTML = '<section class="account-panel account-error-panel"><h1>Account unavailable</h1><p>Could not load the secure account service. Check your connection and try again.</p></section>';
  };
  document.head.append(script);
}
