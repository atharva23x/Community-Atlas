(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});
  const USERS_KEY = "communityatlas.users.v1";
  const SESSION_KEY = "communityatlas.session.v1";
  const PBKDF2_ITERATIONS = 120000;
  const DEMO_EMAIL = "admin@communityatlas.app";
  const DEMO_PASSWORD = "admin123";
  const DEMO_SALT = "636f6d6d756e69747961746c61732d61646d696e2d7631";
  const DEMO_HASH = "88069427d6c191e0435a6b6cef74338e2f2fe3618968410567d6d903b78cb0f6";

  let els = {};
  let users = [];
  let currentUser = null;
  let pendingCallback = null;
  let lastFocusedElement = null;
  let initialized = false;

  function seedAdmin() {
    return {
      id: "user-demo-admin",
      name: "Atlas Admin",
      email: DEMO_EMAIL,
      role: "admin",
      salt: DEMO_SALT,
      hash: DEMO_HASH,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    if (typeof raw.id !== "string" || !raw.id) {
      return null;
    }
    if (typeof raw.email !== "string" || !raw.email.trim()) {
      return null;
    }
    if (typeof raw.salt !== "string" || !raw.salt || typeof raw.hash !== "string" || !raw.hash) {
      return null;
    }
    return {
      id: raw.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Community reporter",
      email: raw.email.trim().toLowerCase(),
      role: raw.role === "admin" ? "admin" : "reporter",
      salt: raw.salt,
      hash: raw.hash,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
    };
  }

  function readUsers() {
    let stored = [];
    try {
      const raw = window.localStorage.getItem(USERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stored = parsed.map(normalizeUser).filter(Boolean);
        }
      }
    } catch (error) {
      stored = [];
    }

    if (!stored.some(function (user) {
      return user.email === DEMO_EMAIL;
    })) {
      stored.unshift(seedAdmin());
      try {
        writeUsers(stored);
      } catch (error) {
        return stored;
      }
    }
    return stored;
  }

  function writeUsers(nextUsers) {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
  }

  function publicUser(user) {
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    };
  }

  function findByEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    return users.find(function (user) {
      return user.email === normalized;
    }) || null;
  }

  function readSession() {
    try {
      const userId = window.localStorage.getItem(SESSION_KEY);
      if (!userId) {
        return null;
      }
      return users.find(function (user) {
        return user.id === userId;
      }) || null;
    } catch (error) {
      return null;
    }
  }

  function writeSession(user) {
    try {
      if (user) {
        window.localStorage.setItem(SESSION_KEY, user.id);
      } else {
        window.localStorage.removeItem(SESSION_KEY);
      }
    } catch (error) {
      return;
    }
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  function randomHex(byteCount) {
    const bytes = new Uint8Array(byteCount);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    return toHex(bytes.buffer);
  }

  function hashPassword(password, saltHex) {
    if (!window.crypto || !window.crypto.subtle || typeof window.TextEncoder !== "function") {
      return Promise.reject(new Error("crypto-unavailable"));
    }
    const encoder = new TextEncoder();
    return window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    ).then(function (key) {
      return window.crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt: hexToBytes(saltHex),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      }, key, 256);
    }).then(function (bits) {
      return toHex(bits);
    });
  }

  function safeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
      return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  function createUserId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "user-" + window.crypto.randomUUID();
    }
    return "user-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      try {
        window.lucide.createIcons();
      } catch (error) {
        return;
      }
    }
  }

  function cacheElements() {
    els = {
      appShell: document.getElementById("appShell"),
      authBtn: document.getElementById("authBtn"),
      authAvatar: document.getElementById("authAvatar"),
      authName: document.getElementById("authName"),
      authRole: document.getElementById("authRole"),
      authMenu: document.getElementById("authMenu"),
      authMenuName: document.getElementById("authMenuName"),
      authMenuEmail: document.getElementById("authMenuEmail"),
      authMenuRole: document.getElementById("authMenuRole"),
      authImpactBtn: document.getElementById("authImpactBtn"),
      authImpactLabel: document.getElementById("authImpactLabel"),
      authAdminBtn: document.getElementById("authAdminBtn"),
      authSignOutBtn: document.getElementById("authSignOutBtn"),
      modal: document.getElementById("authModal"),
      closeButton: document.getElementById("authClose"),
      title: document.getElementById("authTitle"),
      subtitle: document.getElementById("authSubtitle"),
      message: document.getElementById("authMessage"),
      tabSignin: document.getElementById("authTabSignin"),
      tabRegister: document.getElementById("authTabRegister"),
      signinPanel: document.getElementById("authSigninPanel"),
      registerPanel: document.getElementById("authRegisterPanel"),
      signinForm: document.getElementById("authSigninForm"),
      registerForm: document.getElementById("authRegisterForm"),
      signinEmail: document.getElementById("authSigninEmail"),
      signinPassword: document.getElementById("authSigninPassword"),
      signinError: document.getElementById("authSigninError"),
      signinSubmit: document.getElementById("authSigninSubmit"),
      registerName: document.getElementById("authRegisterName"),
      registerEmail: document.getElementById("authRegisterEmail"),
      registerPassword: document.getElementById("authRegisterPassword"),
      registerError: document.getElementById("authRegisterError"),
      registerSubmit: document.getElementById("authRegisterSubmit"),
      demoFill: document.getElementById("authDemoFill")
    };
  }

  function renderHeader() {
    if (!els.authBtn) {
      return;
    }
    const signedIn = Boolean(currentUser);
    els.authBtn.classList.toggle("is-signed-in", signedIn);
    els.authBtn.setAttribute("aria-haspopup", signedIn ? "menu" : "dialog");
    els.authBtn.setAttribute("aria-expanded", "false");

    if (signedIn) {
      els.authAvatar.textContent = initials(currentUser.name);
      els.authName.textContent = currentUser.name;
      els.authRole.textContent = currentUser.role === "admin" ? "Administrator" : "Reporter";
      els.authBtn.setAttribute("aria-label", "Open account menu for " + currentUser.name);
      els.authMenuName.textContent = currentUser.name;
      els.authMenuEmail.textContent = currentUser.email;
      els.authMenuRole.textContent = currentUser.role === "admin" ? "Admin access" : "Reporter access";
      els.authMenuRole.className = "user-role" + (currentUser.role === "admin" ? " is-admin" : "");
      els.authImpactBtn.hidden = false;
      if (els.authImpactLabel) {
        els.authImpactLabel.textContent = currentUser.role === "admin"
          ? "Community rankings"
          : "My impact & badges";
      }
      els.authAdminBtn.hidden = currentUser.role !== "admin";
    } else {
      els.authAvatar.replaceChildren();
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "user-round");
      icon.setAttribute("aria-hidden", "true");
      els.authAvatar.appendChild(icon);
      els.authName.textContent = "Sign in";
      els.authRole.textContent = "Report & vote";
      els.authBtn.setAttribute("aria-label", "Sign in or create an account");
      els.authMenuName.textContent = "";
      els.authMenuEmail.textContent = "";
      els.authMenuRole.textContent = "";
      els.authImpactBtn.hidden = true;
      els.authAdminBtn.hidden = true;
    }
    refreshIcons();
  }

  function toggleMenu(forceOpen) {
    if (!els.authMenu || !currentUser) {
      return;
    }
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : els.authMenu.hidden;
    els.authMenu.hidden = !shouldOpen;
    els.authBtn.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      const first = els.authMenu.querySelector("button:not([hidden])");
      if (first) {
        first.focus();
      }
    }
  }

  function closeMenu() {
    if (!els.authMenu || els.authMenu.hidden) {
      return;
    }
    els.authMenu.hidden = true;
    els.authBtn.setAttribute("aria-expanded", "false");
  }

  function setMode(mode) {
    const register = mode === "register";
    els.tabSignin.setAttribute("aria-selected", String(!register));
    els.tabRegister.setAttribute("aria-selected", String(register));
    els.tabSignin.tabIndex = register ? -1 : 0;
    els.tabRegister.tabIndex = register ? 0 : -1;
    els.signinPanel.hidden = register;
    els.registerPanel.hidden = !register;
    els.title.textContent = register ? "Create a reporter account" : "Welcome back";
    els.subtitle.textContent = register
      ? "Add reports and back the fixes your community needs."
      : "Sign in to report issues and support community fixes.";
    clearErrors();
  }

  function setMessage(message) {
    els.message.textContent = message || "";
    els.message.hidden = !message;
  }

  function clearErrors() {
    if (els.signinError) {
      els.signinError.textContent = "";
      els.signinError.hidden = true;
    }
    if (els.registerError) {
      els.registerError.textContent = "";
      els.registerError.hidden = true;
    }
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function setBusy(form, busy, label) {
    const submit = form === els.signinForm ? els.signinSubmit : els.registerSubmit;
    const fields = Array.from(form.querySelectorAll("input, button"));
    fields.forEach(function (field) {
      field.disabled = busy;
    });
    submit.textContent = busy ? label : (form === els.signinForm ? "Sign in" : "Create account");
  }

  function focusActiveField() {
    if (!els.modal || els.modal.hidden) {
      return;
    }
    const register = !els.registerPanel.hidden;
    const target = register ? els.registerName : els.signinEmail;
    if (target) {
      target.focus();
    }
  }

  function open(mode, options) {
    const settings = options || {};
    pendingCallback = typeof settings.onAuthenticated === "function"
      ? settings.onAuthenticated
      : null;
    clearErrors();
    setMessage(settings.message || "");
    setMode(mode === "register" ? "register" : "signin");
    if (!els.modal.hidden) {
      focusActiveField();
      return;
    }
    closeMenu();
    lastFocusedElement = document.activeElement;
    els.modal.hidden = false;
    if (els.appShell) {
      els.appShell.inert = true;
    }
    refreshIcons();
    window.setTimeout(focusActiveField, 0);
  }

  function close() {
    if (!els.modal || els.modal.hidden) {
      return;
    }
    pendingCallback = null;
    els.modal.hidden = true;
    els.signinPassword.value = "";
    els.registerPassword.value = "";
    setBusy(els.signinForm, false);
    setBusy(els.registerForm, false);
    if (els.appShell) {
      els.appShell.inert = false;
    }
    const target = lastFocusedElement;
    lastFocusedElement = null;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function setCurrentUser(user) {
    currentUser = user;
    writeSession(user);
    renderHeader();
  }

  function completeAuth(user, reason) {
    const callback = pendingCallback;
    setCurrentUser(user);
    if (!els.modal.hidden) {
      close();
    }
    document.dispatchEvent(new CustomEvent("atlas:authchange", {
      detail: { user: publicUser(currentUser), reason: reason }
    }));
    if (callback) {
      callback(publicUser(user));
    }
  }

  function handleSignIn(event) {
    event.preventDefault();
    clearErrors();
    const email = els.signinEmail.value.trim();
    const password = els.signinPassword.value;

    if (!email || !password) {
      showError(els.signinError, "Enter your email and password.");
      return;
    }

    setBusy(els.signinForm, true, "Signing in…");
    const user = findByEmail(email);

    if (!user) {
      setBusy(els.signinForm, false);
      showError(els.signinError, "Email or password doesn't match.");
      return;
    }

    hashPassword(password, user.salt).then(function (hash) {
      if (!safeEqual(hash, user.hash)) {
        showError(els.signinError, "Email or password doesn't match.");
        return;
      }
      completeAuth(user, "login");
    }).catch(function () {
      showError(els.signinError, "Sign-in needs a secure browser context. Use localhost or HTTPS.");
    }).finally(function () {
      setBusy(els.signinForm, false);
    });
  }

  function handleRegister(event) {
    event.preventDefault();
    clearErrors();
    const name = els.registerName.value.trim();
    const email = els.registerEmail.value.trim().toLowerCase();
    const password = els.registerPassword.value;

    if (name.length < 2) {
      showError(els.registerError, "Enter your full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(els.registerError, "Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      showError(els.registerError, "Use at least 8 characters for your password.");
      return;
    }
    if (findByEmail(email)) {
      showError(els.registerError, "An account with this email already exists.");
      return;
    }

    setBusy(els.registerForm, true, "Creating account…");
    const salt = randomHex(16);

    hashPassword(password, salt).then(function (hash) {
      const user = {
        id: createUserId(),
        name: name,
        email: email,
        role: "reporter",
        salt: salt,
        hash: hash,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      writeUsers(users);
      completeAuth(user, "register");
    }).catch(function () {
      showError(els.registerError, "Couldn't create the account. Use localhost or HTTPS and try again.");
    }).finally(function () {
      setBusy(els.registerForm, false);
    });
  }

  function handleSignOut() {
    setCurrentUser(null);
    closeMenu();
    document.dispatchEvent(new CustomEvent("atlas:authchange", {
      detail: { user: null, reason: "logout" }
    }));
  }

  function handleTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const register = event.key === "ArrowRight";
    setMode(register ? "register" : "signin");
    (register ? els.tabRegister : els.tabSignin).focus();
  }

  function handleModalKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(els.modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) {
      return element.offsetParent !== null;
    });
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleDocumentPointerDown(event) {
    if (
      els.authMenu &&
      !els.authMenu.hidden &&
      !event.target.closest(".auth-wrap")
    ) {
      closeMenu();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && els.authMenu && !els.authMenu.hidden) {
      event.preventDefault();
      closeMenu();
      els.authBtn.focus();
    }
  }

  function bindEvents() {
    els.authBtn.addEventListener("click", function () {
      if (!currentUser) {
        open("signin");
        return;
      }
      toggleMenu();
    });

    els.authMenu.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        els.authBtn.focus();
      }
    });

    els.authImpactBtn.addEventListener("click", function () {
      toggleMenu(false);
      document.dispatchEvent(new CustomEvent("atlas:leaderboard"));
    });
    els.authAdminBtn.addEventListener("click", function () {
      toggleMenu(false);
      document.dispatchEvent(new CustomEvent("atlas:adminqueue"));
    });

    els.authSignOutBtn.addEventListener("click", handleSignOut);
    els.closeButton.addEventListener("click", close);
    els.modal.addEventListener("click", function (event) {
      if (event.target === els.modal) {
        close();
      }
    });
    els.modal.addEventListener("keydown", handleModalKeydown);

    els.tabSignin.addEventListener("click", function () {
      setMode("signin");
      window.setTimeout(focusActiveField, 0);
    });
    els.tabRegister.addEventListener("click", function () {
      setMode("register");
      window.setTimeout(focusActiveField, 0);
    });
    els.tabSignin.addEventListener("keydown", handleTabKeydown);
    els.tabRegister.addEventListener("keydown", handleTabKeydown);

    els.signinForm.addEventListener("submit", handleSignIn);
    els.registerForm.addEventListener("submit", handleRegister);

    els.demoFill.addEventListener("click", function () {
      setMode("signin");
      els.signinEmail.value = DEMO_EMAIL;
      els.signinPassword.value = DEMO_PASSWORD;
      if (typeof els.signinForm.requestSubmit === "function") {
        els.signinForm.requestSubmit();
      }
    });

    els.signinEmail.addEventListener("input", clearErrors);
    els.signinPassword.addEventListener("input", clearErrors);
    els.registerName.addEventListener("input", clearErrors);
    els.registerEmail.addEventListener("input", clearErrors);
    els.registerPassword.addEventListener("input", clearErrors);

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeydown);
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    cacheElements();
    users = readUsers();
    currentUser = readSession();
    renderHeader();
    bindEvents();
  }

  C.Auth = {
    USERS_KEY: USERS_KEY,
    SESSION_KEY: SESSION_KEY,
    DEMO_EMAIL: DEMO_EMAIL,
    DEMO_PASSWORD: DEMO_PASSWORD,
    init: init,
    open: open,
    close: close,
    getCurrentUser: function () {
      return publicUser(currentUser);
    },
    getUsers: function () {
      return users.map(publicUser);
    },
    isSignedIn: function () {
      return Boolean(currentUser);
    },
    isAdmin: function () {
      return Boolean(currentUser && currentUser.role === "admin");
    }
  };
})();
