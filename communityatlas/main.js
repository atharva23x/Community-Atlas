(function () {
  "use strict";

  const C = window.CommunityAtlas;
  const MESSAGES = {
    saved: "Feature saved",
    deleted: "Feature deleted",
    geojson: "GeoJSON exported",
    csv: "CSV exported",
    empty: "Add at least one feature first.",
    storage: "Couldn't save locally — export your data to keep it.",
    tile: "Some map tiles couldn't load. Your markers are safe — you can still work.",
    drawError: "Couldn't add that feature. Please try drawing it again.",
    supportAdded: "Support added",
    supportRemoved: "Support removed",
    statusUpdated: "Status updated",
    reportSubmitted: "Report submitted for admin review",
    reportApproved: "Report approved and published",
    reportRejected: "Report rejected",
    commentPosted: "Comment posted",
    adminNoReport: "Moderator accounts review reports; switch to a reporter account to add one.",
    adminNoVote: "Moderator accounts don't vote in community rankings.",
    deleteDenied: "Only the reporter or an admin can delete this report."
  };

  const STATUSES = [
    { id: "pending", label: "Pending review" },
    { id: "open", label: "Open" },
    { id: "in_review", label: "In review" },
    { id: "in_progress", label: "In progress" },
    { id: "resolved", label: "Resolved" },
    { id: "rejected", label: "Rejected" }
  ];
  const STATUS_MAP = {};
  STATUSES.forEach(function (status) {
    STATUS_MAP[status.id] = status;
  });
  const STATUS_COLORS = {
    pending: "#8A6A12",
    open: "#D14343",
    in_review: "#C77A10",
    in_progress: "#2563EB",
    resolved: "#16805B",
    rejected: "#6B7280"
  };
  const APPROVED_STATUSES = {
    open: true,
    in_review: true,
    in_progress: true,
    resolved: true
  };
  const NEARBY_RADII = [500, 2000, 5000];
  const DEFAULT_BASEMAP = "streets";

  const TOOL_HINTS = {
    point: "Click the map to place a point. Press Esc to cancel.",
    line: "Click to add points. Double-click to finish. Press Esc to cancel.",
    area: "Click to add corners. Double-click to close the area. Press Esc to cancel."
  };

  const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
  const PHOTO_MAX_DIMENSION = 1280;
  const PHOTO_QUALITY = 0.82;

  const DUPLICATE_RADIUS_METERS = 30;
  const DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;
  const FIRST_FIX_ZOOM = 17;

  const state = {
    features: [],
    pending: null,
    pendingPhoto: null,
    duplicateMatches: [],
    activeTool: null,
    pendingDeleteId: null,
    pendingDeleteButton: null,
    deleteTimer: null,
    saveTimer: null,
    tileBannerTimer: null,
    lastFocusedElement: null,
    lastPhotoButton: null,
    lastReportFocusedElement: null,
    activeReportId: null,
    photoViewerFromReportDetail: false,
    lastAdminFocusedElement: null,
    lastLeaderboardFocusedElement: null,
    sort: "nearest",
    mineOnly: false,
    adminView: "queue",
    hasCenteredOnPosition: false,
    nearby: {
      enabled: true,
      radius: 2000,
      lat: null,
      lng: null
    }
  };

  let els = {};
  let draw = null;

  function init() {
    cacheElements();
    renderCategoryLegend();
    renderCategoryOptions();
    C.Theme.init();
    if (C.Auth) {
      C.Auth.init();
    }

    C.MapView.init("map", {
      basemap: DEFAULT_BASEMAP,
      onTileWarning: showTileBanner
    });
    C.bus.on("feature:select", function (payload) {
      if (payload && payload.id) {
        openReportDetail(payload.id);
      }
    });
    document.addEventListener("atlas:authchange", handleAuthChange);
    document.addEventListener("atlas:adminqueue", openAdminModal);
    document.addEventListener("atlas:leaderboard", openLeaderboard);
    if (C.Search) {
      C.Search.init();
    }
    draw = C.Draw.init({
      onComplete: handleDrawComplete,
      onChange: handleToolChange,
      onError: handleDrawError
    });

    bindEvents();
    renderBasemapMenu();
    syncBasemapUi(C.MapView.getBasemap());
    loadSavedFeatures();
    if (isAdminUser()) {
      state.nearby.enabled = false;
    }
    setFeatureSort(isAdminUser() ? "votes" : "nearest");
    applyRoleUi();
    renderFeatureList();
    updateExportAvailability();
    C.Position.subscribe(handlePositionUpdate);
    renderPosition();
    C.Position.start();
    renderNearbyControls();
    setSidebar(false);
    draw.deactivate();
    refreshIcons();
  }

  function cacheElements() {
    els = {
      appShell: document.getElementById("appShell"),
      savePill: document.getElementById("savePill"),
      saveText: document.getElementById("saveText"),
      positionInputs: Array.from(document.querySelectorAll('input[name="positionMode"]')),
      positionAccuracy: document.getElementById("positionAccuracy"),
      positionState: document.getElementById("positionState"),
      positionHint: document.getElementById("positionHint"),
      headerExportBtn: document.getElementById("headerExportBtn"),
      exportMenu: document.getElementById("exportMenu"),
      headerExportGeo: document.getElementById("headerExportGeo"),
      headerExportCsv: document.getElementById("headerExportCsv"),
      toolButtons: Array.from(document.querySelectorAll(".tool-btn")),
      toolHint: document.getElementById("toolHint"),
      categoryLegend: document.getElementById("categoryLegend"),
      featureList: document.getElementById("featureList"),
      featureCount: document.getElementById("featureCount"),
      featureMineToggle: document.getElementById("featureMineToggle"),
      featureMineCount: document.getElementById("featureMineCount"),
      featureSort: document.getElementById("featureSort"),
      emptyState: document.getElementById("emptyState"),
      emptyStateText: document.getElementById("emptyStateText"),
      nearbyEmptyBtn: document.getElementById("nearbyEmptyBtn"),
      nearbyBar: document.getElementById("nearbyBar"),
      nearbyToggle: document.getElementById("nearbyToggle"),
      nearbyRadius: document.getElementById("nearbyRadius"),
      nearbyStatus: document.getElementById("nearbyStatus"),
      sampleBtn: document.getElementById("sampleBtn"),
      adminQueueBtn: document.getElementById("adminQueueBtn"),
      adminQueueMeta: document.getElementById("adminQueueMeta"),
      adminModal: document.getElementById("adminModal"),
      adminSubtitle: document.getElementById("adminSubtitle"),
      adminClose: document.getElementById("adminClose"),
      adminCloseBtn: document.getElementById("adminCloseBtn"),
      adminStats: document.getElementById("adminStats"),
      adminList: document.getElementById("adminList"),
      adminEmpty: document.getElementById("adminEmpty"),
      adminTabQueue: document.getElementById("adminTabQueue"),
      adminTabAnalytics: document.getElementById("adminTabAnalytics"),
      adminQueuePanel: document.getElementById("adminQueuePanel"),
      adminAnalyticsPanel: document.getElementById("adminAnalyticsPanel"),
      analyticsKpis: document.getElementById("analyticsKpis"),
      analyticsGrid: document.getElementById("analyticsGrid"),
      impactCard: document.getElementById("impactCard"),
      impactIcon: document.getElementById("impactIcon"),
      impactTitle: document.getElementById("impactTitle"),
      impactPoints: document.getElementById("impactPoints"),
      impactSub: document.getElementById("impactSub"),
      impactProgress: document.getElementById("impactProgress"),
      impactProgressBar: document.getElementById("impactProgressBar"),
      impactMeta: document.getElementById("impactMeta"),
      leaderboardModal: document.getElementById("leaderboardModal"),
      leaderboardClose: document.getElementById("leaderboardClose"),
      leaderboardCloseBtn: document.getElementById("leaderboardCloseBtn"),
      leaderboardSelf: document.getElementById("leaderboardSelf"),
      leaderboardBadgeSection: document.getElementById("leaderboardBadgeSection"),
      leaderboardPointsNote: document.getElementById("leaderboardPointsNote"),
      leaderboardSubtitle: document.getElementById("leaderboardSubtitle"),
      leaderboardBadges: document.getElementById("leaderboardBadges"),
      badgeSummary: document.getElementById("badgeSummary"),
      leaderboardList: document.getElementById("leaderboardList"),
      leaderboardEmpty: document.getElementById("leaderboardEmpty"),
      leaderboardScope: document.getElementById("leaderboardScope"),
      exportGeoBtn: document.getElementById("exportGeoBtn"),
      exportCsvBtn: document.getElementById("exportCsvBtn"),
      verifyBtn: document.getElementById("verifyBtn"),
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebarToggle"),
      basemapToggle: document.getElementById("basemapToggle"),
      basemapMenu: document.getElementById("basemapMenu"),
      basemapOptions: document.getElementById("basemapOptions"),
      basemapLabel: document.getElementById("basemapLabel"),
      tileBanner: document.getElementById("tileBanner"),
      authModal: document.getElementById("authModal"),
      featureModal: document.getElementById("featureModal"),
      featureForm: document.getElementById("featureForm"),
      reportPosition: document.getElementById("reportPosition"),
      reportPositionMode: document.getElementById("reportPositionMode"),
      reportAccuracy: document.getElementById("reportAccuracy"),
      reportPositionNote: document.getElementById("reportPositionNote"),
      duplicateAlert: document.getElementById("duplicateAlert"),
      duplicateText: document.getElementById("duplicateText"),
      duplicateList: document.getElementById("duplicateList"),
      featureName: document.getElementById("featureName"),
      featureCategory: document.getElementById("featureCategory"),
      featureNotes: document.getElementById("featureNotes"),
      nameError: document.getElementById("nameError"),
      featurePhoto: document.getElementById("featurePhoto"),
      photoField: document.getElementById("photoField"),
      photoChooseBtn: document.getElementById("photoChooseBtn"),
      photoChooseTitle: document.getElementById("photoChooseTitle"),
      photoPreview: document.getElementById("photoPreview"),
      photoPreviewImg: document.getElementById("photoPreviewImg"),
      photoPreviewName: document.getElementById("photoPreviewName"),
      photoReplaceBtn: document.getElementById("photoReplaceBtn"),
      photoRemoveBtn: document.getElementById("photoRemoveBtn"),
      photoError: document.getElementById("photoError"),
      photoViewer: document.getElementById("photoViewer"),
      photoViewerImage: document.getElementById("photoViewerImage"),
      photoViewerCaption: document.getElementById("photoViewerCaption"),
      photoViewerClose: document.getElementById("photoViewerClose"),
      reportDetailModal: document.getElementById("reportDetailModal"),
      reportDetailCard: document.querySelector("#reportDetailModal .report-detail-card"),
      reportDetailClose: document.getElementById("reportDetailClose"),
      reportDetailCloseBtn: document.getElementById("reportDetailCloseBtn"),
      reportDetailCategory: document.getElementById("reportDetailCategory"),
      reportDetailTitle: document.getElementById("reportDetailTitle"),
      reportDetailSubtitle: document.getElementById("reportDetailSubtitle"),
      reportDetailPhoto: document.getElementById("reportDetailPhoto"),
      reportDetailPhotoImg: document.getElementById("reportDetailPhotoImg"),
      reportDetailNotes: document.getElementById("reportDetailNotes"),
      reportDetailStatus: document.getElementById("reportDetailStatus"),
      reportDetailVotes: document.getElementById("reportDetailVotes"),
      reportDetailPosition: document.getElementById("reportDetailPosition"),
      reportDetailGeometry: document.getElementById("reportDetailGeometry"),
      reportDetailReporter: document.getElementById("reportDetailReporter"),
      reportDetailLocate: document.getElementById("reportDetailLocate"),
      reportCommentsCount: document.getElementById("reportCommentsCount"),
      reportCommentList: document.getElementById("reportCommentList"),
      reportCommentsEmpty: document.getElementById("reportCommentsEmpty"),
      reportCommentForm: document.getElementById("reportCommentForm"),
      reportCommentInput: document.getElementById("reportCommentInput"),
      reportCommentError: document.getElementById("reportCommentError"),
      reportCommentSignin: document.getElementById("reportCommentSignin"),
      reportCommentSigninBtn: document.getElementById("reportCommentSigninBtn"),
      modalCancel: document.getElementById("modalCancel"),
      modalSave: document.getElementById("modalSave"),
      toastRegion: document.getElementById("toastRegion")
    };
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

  function renderCategoryLegend() {
    const items = C.categories.map(function (category) {
      const item = document.createElement("li");
      item.className = "legend-item";

      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.backgroundColor = category.color;
      dot.setAttribute("aria-hidden", "true");

      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", category.icon);
      icon.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = category.name;

      item.appendChild(dot);
      item.appendChild(icon);
      item.appendChild(label);
      return item;
    });

    els.categoryLegend.replaceChildren.apply(els.categoryLegend, items);
  }

  function renderCategoryOptions() {
    const options = C.categories.map(function (category) {
      const option = document.createElement("option");
      option.value = category.name;
      option.textContent = category.name;
      return option;
    });
    els.featureCategory.replaceChildren.apply(els.featureCategory, options);
    els.featureCategory.value = "Other";
  }

  function renderBasemapMenu() {
    const items = C.MapView.basemaps.map(function (basemap) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "basemap-option";
      button.dataset.basemap = basemap.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");

      const swatch = document.createElement("span");
      swatch.className = "basemap-swatch basemap-swatch-" + basemap.id;
      swatch.setAttribute("aria-hidden", "true");

      const copy = document.createElement("span");
      copy.className = "basemap-option-copy";

      const name = document.createElement("span");
      name.className = "basemap-option-name";
      name.textContent = basemap.label;

      const description = document.createElement("span");
      description.className = "basemap-option-description";
      description.textContent = basemap.description;

      const check = document.createElement("i");
      check.className = "basemap-check";
      check.setAttribute("data-lucide", "check");
      check.setAttribute("aria-hidden", "true");

      copy.appendChild(name);
      copy.appendChild(description);
      button.appendChild(swatch);
      button.appendChild(copy);
      button.appendChild(check);

      button.addEventListener("click", function () {
        selectBasemap(basemap.id);
      });

      return button;
    });

    els.basemapOptions.replaceChildren.apply(els.basemapOptions, items);
    refreshIcons();
  }

  function syncBasemapUi(id) {
    const items = Array.from(els.basemapOptions.querySelectorAll(".basemap-option"));
    let label = "Streets";

    items.forEach(function (item) {
      const selected = item.dataset.basemap === id;
      item.setAttribute("aria-checked", String(selected));
      item.tabIndex = selected ? 0 : -1;
      if (selected) {
        label = item.querySelector(".basemap-option-name").textContent;
      }
    });

    els.basemapLabel.textContent = label;
  }

  function toggleBasemapMenu(forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean"
      ? forceOpen
      : els.basemapMenu.hidden;

    els.basemapMenu.hidden = !shouldOpen;
    els.basemapToggle.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen) {
      const selected = els.basemapOptions.querySelector('[aria-checked="true"]') ||
        els.basemapOptions.querySelector(".basemap-option");
      if (selected) {
        selected.focus();
      }
    }
  }

  function selectBasemap(id) {
    const active = C.MapView.setBasemap(id);
    if (!active) {
      return;
    }
    syncBasemapUi(active);
    toggleBasemapMenu(false);
    els.basemapToggle.focus();
  }

  function handleBasemapOptionsKeydown(event) {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft"
    ) {
      return;
    }

    const items = Array.from(els.basemapOptions.querySelectorAll(".basemap-option"));
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + items.length) % items.length;

    items.forEach(function (item, index) {
      item.tabIndex = index === nextIndex ? 0 : -1;
    });
    items[nextIndex].focus();
  }

  function handlePositionModeChange(event) {
    if (!event.target || event.target.name !== "positionMode") {
      return;
    }
    C.Position.setMode(event.target.value);
    renderPosition();
    renderReportPosition();
  }

  function handlePositionUpdate() {
    renderPosition();
    renderReportPosition();

    const snapshot = C.Position.getSnapshot();
    if (
      snapshot.mode === "gnss" &&
      typeof snapshot.lat === "number" &&
      typeof snapshot.lng === "number"
    ) {
      C.MapView.setUserLocation(snapshot.lat, snapshot.lng, snapshot.accuracy);
      const moved = !hasNearbyLocation() ||
        distanceMeters(
          { lat: state.nearby.lat, lng: state.nearby.lng },
          { lat: snapshot.lat, lng: snapshot.lng }
        ) > 25;
      state.nearby.lat = snapshot.lat;
      state.nearby.lng = snapshot.lng;
      if (!state.hasCenteredOnPosition) {
        state.hasCenteredOnPosition = true;
        C.MapView.centerOn(snapshot.lat, snapshot.lng, FIRST_FIX_ZOOM, false);
      }
      if (moved && state.nearby.enabled) {
        renderFeatureList();
      }
    }
    renderNearbyControls();
  }

  function renderPosition() {
    const mode = C.Position.getMode();
    const snapshot = C.Position.getSnapshot();
    const status = C.Position.getStatus();
    const isMock = C.Position.isBadgeMock(snapshot);
    const isUnknown = typeof snapshot.accuracy !== "number";

    els.positionInputs.forEach(function (input) {
      input.checked = input.value === mode.id;
    });

    els.positionAccuracy.textContent = C.Position.badgeText(snapshot);
    els.positionAccuracy.title = C.Position.badgeTitle(snapshot);
    els.positionAccuracy.classList.toggle("is-mock", isMock);
    els.positionAccuracy.classList.toggle("is-unknown", isUnknown);
    els.positionState.textContent = status.message;
    els.positionHint.textContent = mode.note;
  }

  function renderReportPosition() {
    if (!els.featureModal || els.featureModal.hidden) {
      return;
    }

    const snapshot = C.Position.getSnapshot();
    const isMock = C.Position.isBadgeMock(snapshot);
    const isUnknown = typeof snapshot.accuracy !== "number";

    els.reportPositionMode.textContent = snapshot.label;
    els.reportAccuracy.textContent = C.Position.badgeText(snapshot);
    els.reportAccuracy.title = C.Position.badgeTitle(snapshot);
    els.reportAccuracy.classList.toggle("is-mock", isMock);
    els.reportAccuracy.classList.toggle("is-unknown", isUnknown);
    els.reportPosition.classList.toggle("is-mock", isMock);
    els.reportPositionNote.textContent = C.Position.modeNote(snapshot.mode);
  }

  function currentPosition() {
    const snapshot = C.Position.getSnapshot();
    return {
      mode: snapshot.mode,
      label: snapshot.label,
      source: snapshot.source,
      accuracy: typeof snapshot.accuracy === "number" ? snapshot.accuracy : null,
      mock: snapshot.mock === true,
      timestamp: snapshot.timestamp || new Date().toISOString()
    };
  }

  function bindEvents() {
    els.toolButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        activateTool(button.dataset.tool);
      });
    });

    els.sampleBtn.addEventListener("click", loadSampleFeatures);
    els.nearbyToggle.addEventListener("click", handleNearbyToggle);
    els.nearbyRadius.addEventListener("change", handleNearbyRadiusChange);
    els.nearbyEmptyBtn.addEventListener("click", showAllReports);
    els.featureMineToggle.addEventListener("click", handleMineFilterToggle);
    els.featureSort.addEventListener("change", handleSortChange);
    els.adminQueueBtn.addEventListener("click", openAdminModal);
    els.adminClose.addEventListener("click", closeAdminModal);
    els.adminCloseBtn.addEventListener("click", closeAdminModal);
    els.adminModal.addEventListener("click", function (event) {
      if (event.target === els.adminModal) {
        closeAdminModal();
      }
    });
    els.adminModal.addEventListener("keydown", handleAdminModalKeydown);
    els.adminTabQueue.addEventListener("click", function () {
      setAdminView("queue");
    });
    els.adminTabAnalytics.addEventListener("click", function () {
      setAdminView("analytics");
    });
    els.adminTabQueue.addEventListener("keydown", handleAdminTabKeydown);
    els.adminTabAnalytics.addEventListener("keydown", handleAdminTabKeydown);
    els.impactCard.addEventListener("click", openLeaderboard);
    els.leaderboardClose.addEventListener("click", closeLeaderboard);
    els.leaderboardCloseBtn.addEventListener("click", closeLeaderboard);
    els.leaderboardModal.addEventListener("click", function (event) {
      if (event.target === els.leaderboardModal) {
        closeLeaderboard();
      }
    });
    els.leaderboardModal.addEventListener("keydown", handleLeaderboardKeydown);
    els.leaderboardSelf.addEventListener("click", function (event) {
      const signInButton = event.target.closest("#leaderboardSignInBtn");
      if (!signInButton) {
        return;
      }
      closeLeaderboard();
      if (C.Auth) {
        C.Auth.open("signin", {
          message: "Sign in to earn points, unlock badges, and join the rankings.",
          onAuthenticated: function () {
            openLeaderboard();
          }
        });
      }
    });
    els.positionInputs.forEach(function (input) {
      input.addEventListener("change", handlePositionModeChange);
    });
    els.exportGeoBtn.addEventListener("click", function () {
      exportData("geojson");
    });
    els.exportCsvBtn.addEventListener("click", function () {
      exportData("csv");
    });
    els.verifyBtn.addEventListener("click", openVerification);

    els.headerExportBtn.addEventListener("click", function () {
      toggleExportMenu();
    });
    els.headerExportGeo.addEventListener("click", function () {
      exportData("geojson");
    });
    els.headerExportCsv.addEventListener("click", function () {
      exportData("csv");
    });

    els.sidebarToggle.addEventListener("click", function () {
      setSidebar(!els.sidebar.classList.contains("is-open"));
    });

    els.basemapToggle.addEventListener("click", function () {
      toggleBasemapMenu();
    });
    els.basemapOptions.addEventListener("keydown", handleBasemapOptionsKeydown);

    els.featureForm.addEventListener("submit", function (event) {
      event.preventDefault();
      savePendingFeature();
    });

    els.featureName.addEventListener("input", clearNameError);
    els.featureCategory.addEventListener("change", function () {
      C.MapView.setPreviewCategory(els.featureCategory.value);
    });
    els.featurePhoto.addEventListener("change", function () {
      const files = els.featurePhoto.files;
      handlePhotoSelection(files && files[0]);
    });
    els.photoChooseBtn.addEventListener("click", requestPhotoPicker);
    els.photoReplaceBtn.addEventListener("click", requestPhotoPicker);
    els.photoRemoveBtn.addEventListener("click", clearPhoto);
    els.photoField.addEventListener("dragover", handlePhotoDragOver);
    els.photoField.addEventListener("dragleave", handlePhotoDragLeave);
    els.photoField.addEventListener("drop", handlePhotoDrop);
    els.photoViewerClose.addEventListener("click", closePhotoViewer);
    els.photoViewer.addEventListener("click", function (event) {
      if (event.target === els.photoViewer) {
        closePhotoViewer();
      }
    });
    els.reportDetailClose.addEventListener("click", closeReportDetail);
    els.reportDetailCloseBtn.addEventListener("click", closeReportDetail);
    els.reportDetailModal.addEventListener("click", function (event) {
      if (event.target === els.reportDetailModal) {
        closeReportDetail();
      }
    });
    els.reportDetailModal.addEventListener("keydown", handleReportDetailKeydown);
    els.reportDetailPhoto.addEventListener("click", function () {
      const feature = getActiveReport();
      if (feature) {
        openPhotoViewer(feature);
      }
    });
    els.reportDetailLocate.addEventListener("click", function () {
      const id = state.activeReportId;
      closeReportDetail({ restoreFocus: false });
      if (id) {
        focusFeature(id);
      }
    });
    els.reportCommentForm.addEventListener("submit", handleCommentSubmit);
    els.reportCommentInput.addEventListener("keydown", handleCommentKeydown);
    els.reportCommentInput.addEventListener("input", clearCommentError);
    els.reportCommentSigninBtn.addEventListener("click", handleCommentSignIn);
    els.modalCancel.addEventListener("click", cancelPendingFeature);
    els.featureModal.addEventListener("click", function (event) {
      if (event.target === els.featureModal) {
        cancelPendingFeature();
      }
    });

    els.featureModal.addEventListener("keydown", handleModalKeydown);
    els.featureForm.addEventListener("keydown", handleFormKeydown);
    els.exportMenu.addEventListener("keydown", handleMenuKeydown);

    document.addEventListener("keydown", handleGlobalKeydown, true);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", handleResize);
  }

  function activateTool(tool) {
    if (!draw || !C.categoryMap) {
      return;
    }
    if (els.featureModal && !els.featureModal.hidden) {
      return;
    }
    if (isAdminUser()) {
      showToast(MESSAGES.adminNoReport, "warn");
      return;
    }
    if (!C.Auth || !C.Auth.isSignedIn()) {
      C.Auth.open("signin", {
        message: "Sign in to add a report to the map.",
        onAuthenticated: function () {
          activateTool(tool);
        }
      });
      return;
    }
    toggleExportMenu(false);
    draw.activate(tool);
  }

  function handleToolChange(tool) {
    state.activeTool = tool;
    els.toolButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
    });
    els.toolHint.textContent = tool
      ? TOOL_HINTS[tool]
      : "Choose a tool to start drawing on the map.";

    if (tool && isMobile() && els.sidebar.classList.contains("is-open")) {
      setSidebar(false);
    }
  }

  function handleDrawComplete(payload) {
    if (!payload || !payload.geometry) {
      return;
    }
    state.pending = payload;
    C.MapView.showPreview(payload.geometry, "Other");
    openFeatureModal();
  }

  function handleDrawError() {
    draw.deactivate();
    showToast(MESSAGES.drawError, "warn");
  }

  function openFeatureModal() {
    state.lastFocusedElement = document.activeElement;
    els.featureForm.reset();
    els.featureCategory.value = "Other";
    clearNameError();
    clearPhoto();
    els.featureName.value = "";
    els.featureNotes.value = "";
    els.featureModal.hidden = false;
    if (els.appShell) {
      els.appShell.inert = true;
    }
    renderReportPosition();
    renderDuplicateWarning();
    refreshIcons();
    els.featureName.focus();
  }

  function closeFeatureModal() {
    els.featureModal.hidden = true;
    resetDuplicateWarning();
    if (els.appShell) {
      els.appShell.inert = false;
    }
    if (
      state.lastFocusedElement &&
      state.lastFocusedElement.isConnected &&
      typeof state.lastFocusedElement.focus === "function"
    ) {
      state.lastFocusedElement.focus({ preventScroll: true });
    }
    state.lastFocusedElement = null;
  }

  function savePendingFeature() {
    if (isAdminUser()) {
      showToast(MESSAGES.adminNoReport, "warn");
      return;
    }
    const name = els.featureName.value.trim();
    if (!name) {
      showNameError();
      return;
    }

    const pending = state.pending;
    if (!pending) {
      return;
    }

    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    if (!user) {
      showToast("Sign in to save this report.", "warn");
      return;
    }

    const category = C.categoryMap[els.featureCategory.value]
      ? els.featureCategory.value
      : "Other";

    const feature = {
      id: createId(),
      name: name,
      category: category,
      notes: els.featureNotes.value.trim(),
      photo: state.pendingPhoto || "",
      position: currentPosition(),
      createdAt: new Date().toISOString(),
      geometry: pending.geometry,
      votes: 0,
      voterIds: [],
      comments: [],
      status: "pending",
      createdBy: user.id,
      createdByName: user.name
    };

    state.pending = null;
    state.pendingPhoto = null;
    closeFeatureModal();
    C.MapView.clearPreview();

    state.features.unshift(feature);
    syncMapFeatures();
    renderFeatureList();
    updateExportAvailability();
    persistFeatures();
    showToast(MESSAGES.reportSubmitted);
    draw.resume();
  }

  function cancelPendingFeature() {
    state.pending = null;
    state.pendingPhoto = null;
    clearPhoto();
    closeFeatureModal();
    C.MapView.clearPreview();
    draw.deactivate();
  }

  function showNameError() {
    els.nameError.hidden = false;
    els.featureName.setAttribute("aria-invalid", "true");
    els.featureName.focus();
  }

  function clearNameError() {
    els.nameError.hidden = true;
    els.featureName.removeAttribute("aria-invalid");
  }

  function requestPhotoPicker() {
    els.featurePhoto.value = "";
    els.featurePhoto.click();
  }

  function handlePhotoDragOver(event) {
    event.preventDefault();
    els.photoField.classList.add("is-dragging");
  }

  function handlePhotoDragLeave(event) {
    if (event.relatedTarget && els.photoField.contains(event.relatedTarget)) {
      return;
    }
    els.photoField.classList.remove("is-dragging");
  }

  function handlePhotoDrop(event) {
    event.preventDefault();
    els.photoField.classList.remove("is-dragging");
    const files = event.dataTransfer && event.dataTransfer.files;
    handlePhotoSelection(files && files[0]);
  }

  function handlePhotoSelection(file) {
    if (!file) {
      return;
    }

    els.featurePhoto.value = "";
    clearPhotoError();

    if (!/^image\//.test(file.type)) {
      showPhotoError("Choose an image file.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      showPhotoError("That image is larger than 12 MB.");
      return;
    }

    els.photoChooseBtn.disabled = true;
    els.photoChooseTitle.textContent = "Preparing photo…";

    compressPhoto(file)
      .then(function (result) {
        state.pendingPhoto = result.dataUrl;
        els.photoPreviewImg.src = result.dataUrl;
        els.photoPreviewName.textContent = result.name;
        els.photoPreview.hidden = false;
        els.photoChooseBtn.hidden = true;
        els.photoField.classList.add("has-photo");
      })
      .catch(function () {
        clearPhoto();
        showPhotoError("Couldn't use that image. Try another file.");
      })
      .finally(function () {
        els.photoChooseBtn.disabled = false;
        els.photoChooseTitle.textContent = "Add a photo";
      });
  }

  function compressPhoto(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onerror = function () {
        reject(new Error("read-failed"));
      };

      reader.onload = function () {
        const image = new Image();

        image.onerror = function () {
          reject(new Error("decode-failed"));
        };

        image.onload = function () {
          if (!image.width || !image.height) {
            reject(new Error("empty-image"));
            return;
          }

          const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("canvas-unavailable"));
            return;
          }

          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          try {
            resolve({
              dataUrl: canvas.toDataURL("image/jpeg", PHOTO_QUALITY),
              name: file.name || "Photo"
            });
          } catch (error) {
            reject(error);
          }
        };

        image.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  function showPhotoError(message) {
    els.photoError.textContent = message;
    els.photoError.hidden = false;
  }

  function clearPhotoError() {
    els.photoError.textContent = "";
    els.photoError.hidden = true;
  }

  function clearPhoto() {
    state.pendingPhoto = null;
    els.featurePhoto.value = "";
    els.photoPreview.hidden = true;
    els.photoPreviewImg.removeAttribute("src");
    els.photoPreviewName.textContent = "";
    els.photoChooseBtn.hidden = false;
    els.photoChooseBtn.disabled = false;
    els.photoChooseTitle.textContent = "Add a photo";
    els.photoField.classList.remove("has-photo", "is-dragging");
    clearPhotoError();
  }

  function openPhotoViewer(feature) {
    if (!feature || !feature.photo) {
      return;
    }
    state.lastPhotoButton = document.activeElement;
    state.photoViewerFromReportDetail = Boolean(
      els.reportDetailModal && !els.reportDetailModal.hidden
    );
    els.photoViewerImage.src = feature.photo;
    els.photoViewerImage.alt = "Photo for " + feature.name;
    els.photoViewerCaption.textContent = feature.name + " · " + C.getCategory(feature.category).name;
    els.photoViewer.hidden = false;
    if (state.photoViewerFromReportDetail) {
      els.reportDetailModal.inert = true;
    }
    if (els.appShell) {
      els.appShell.inert = true;
    }
    els.photoViewerClose.focus();
  }

  function closePhotoViewer() {
    els.photoViewer.hidden = true;
    els.photoViewerImage.removeAttribute("src");
    if (state.photoViewerFromReportDetail) {
      els.reportDetailModal.inert = false;
    }
    state.photoViewerFromReportDetail = false;
    if (els.appShell) {
      els.appShell.inert = Boolean(
        els.reportDetailModal && !els.reportDetailModal.hidden
      );
    }
    if (
      state.lastPhotoButton &&
      state.lastPhotoButton.isConnected &&
      typeof state.lastPhotoButton.focus === "function"
    ) {
      state.lastPhotoButton.focus({ preventScroll: true });
    }
    state.lastPhotoButton = null;
  }

  function getActiveReport() {
    return state.features.find(function (feature) {
      return feature.id === state.activeReportId;
    }) || null;
  }

  function openReportDetail(id, options) {
    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!feature || !isFeatureVisible(feature)) {
      return;
    }

    const settings = options || {};
    if (settings.captureFocus !== false) {
      const active = document.activeElement;
      state.lastReportFocusedElement = active && active !== document.body && active.offsetParent !== null
        ? active
        : null;
    }

    state.activeReportId = id;
    if (els.reportCommentInput) {
      els.reportCommentInput.value = "";
    }
    clearCommentError();
    renderReportDetail(feature);
    if (els.reportDetailCard) {
      els.reportDetailCard.scrollTop = 0;
    }
    els.reportDetailModal.hidden = false;
    els.reportDetailModal.inert = false;
    if (els.appShell) {
      els.appShell.inert = true;
    }
    refreshIcons();

    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    if (settings.focusComments && user) {
      els.reportCommentInput.focus();
    } else {
      els.reportDetailClose.focus();
    }
  }

  function closeReportDetail(options) {
    if (!els.reportDetailModal || els.reportDetailModal.hidden) {
      return;
    }
    const settings = options || {};
    const restoreFocus = settings.restoreFocus !== false;

    els.reportDetailModal.hidden = true;
    els.reportDetailModal.inert = false;
    state.activeReportId = null;
    if (els.reportCommentInput) {
      els.reportCommentInput.value = "";
    }
    clearCommentError();
    if (els.appShell) {
      els.appShell.inert = Boolean(els.photoViewer && !els.photoViewer.hidden);
    }

    const target = state.lastReportFocusedElement;
    state.lastReportFocusedElement = null;
    if (
      restoreFocus &&
      target &&
      target.isConnected &&
      typeof target.focus === "function"
    ) {
      target.focus({ preventScroll: true });
    }
  }

  function renderReportDetail(feature) {
    const category = C.getCategory(feature.category);
    const position = feature.position || normalizePosition(null);
    const comments = normalizeComments(feature.comments);
    feature.comments = comments;

    const ownedByCurrentUser = isOwnedByCurrentUser(feature);
    els.reportDetailCategory.textContent = category.name;
    els.reportDetailTitle.textContent = feature.name;
    els.reportDetailSubtitle.textContent = "Reported " +
      formatAge(feature.createdAt) + " by " +
      (ownedByCurrentUser ? "you" : (feature.createdByName || "a community member"));
    els.reportDetailSubtitle.title = formatReportTimestamp(feature.createdAt);

    els.reportDetailStatus.replaceChildren(buildStatusPill(feature.status));
    const voteCount = normalizeVotes(feature.votes);
    els.reportDetailVotes.textContent = voteCount +
      (voteCount === 1 ? " supporter" : " supporters") +
      (isApprovedStatus(feature.status) ? "" : " · opens after approval");
    els.reportDetailGeometry.textContent = formatGeometryLabel(
      feature.geometry && feature.geometry.type
    );

    const accuracy = document.createElement("span");
    accuracy.className = "accuracy-badge";
    if (C.Position.isBadgeMock(position)) {
      accuracy.classList.add("is-mock");
    }
    if (typeof position.accuracy !== "number") {
      accuracy.classList.add("is-unknown");
    }
    accuracy.textContent = C.Position.badgeText(position);
    accuracy.title = C.Position.badgeTitle(position);
    els.reportDetailPosition.replaceChildren(
      accuracy,
      document.createTextNode(" · " + (position.label || "Unspecified"))
    );

    els.reportDetailReporter.textContent =
      (ownedByCurrentUser
        ? "You (" + (feature.createdByName || "reporter") + ")"
        : (feature.createdByName || "Unknown reporter")) +
      " �� " + formatAge(feature.createdAt);
    els.reportDetailReporter.title = formatReportTimestamp(feature.createdAt);

    const notes = feature.notes && feature.notes.trim();
    els.reportDetailNotes.textContent = notes || "No additional details were provided.";
    els.reportDetailNotes.classList.toggle("is-empty", !notes);

    if (feature.photo) {
      els.reportDetailPhoto.hidden = false;
      els.reportDetailPhotoImg.src = feature.photo;
      els.reportDetailPhotoImg.alt = "Photo for " + feature.name;
      els.reportDetailPhoto.setAttribute("aria-label", "View full photo for " + feature.name);
    } else {
      els.reportDetailPhoto.hidden = true;
      els.reportDetailPhotoImg.removeAttribute("src");
      els.reportDetailPhotoImg.alt = "";
    }

    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const signedIn = Boolean(user);
    els.reportCommentForm.hidden = !signedIn;
    els.reportCommentSignin.hidden = signedIn;
    els.reportCommentInput.disabled = !signedIn;
    if (signedIn) {
      els.reportCommentInput.placeholder = "Comment as " + user.name + "…";
    } else {
      els.reportCommentInput.placeholder = "Ask a question or share an update…";
    }

    renderReportComments(feature);
    refreshIcons();
  }

  function renderReportComments(feature) {
    const comments = normalizeComments(feature.comments).slice().sort(function (a, b) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;

    els.reportCommentsCount.textContent = "(" + comments.length + ")";
    els.reportCommentsEmpty.hidden = comments.length > 0;
    els.reportCommentList.hidden = comments.length === 0;

    const items = comments.map(function (comment) {
      const item = document.createElement("li");
      item.className = "comment-item";

      const avatar = document.createElement("span");
      avatar.className = "comment-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = getInitials(comment.createdByName);

      const body = document.createElement("div");
      body.className = "comment-body";

      const head = document.createElement("div");
      head.className = "comment-head";

      const name = document.createElement("strong");
      name.textContent = comment.createdByName + (user && user.id === comment.createdBy ? " (you)" : "");

      const time = document.createElement("time");
      time.dateTime = comment.createdAt;
      time.title = formatReportTimestamp(comment.createdAt);
      time.textContent = formatAge(comment.createdAt);

      const text = document.createElement("p");
      text.className = "comment-text";
      text.textContent = comment.text;

      head.appendChild(name);
      head.appendChild(time);
      body.appendChild(head);
      body.appendChild(text);
      item.appendChild(avatar);
      item.appendChild(body);
      return item;
    });

    els.reportCommentList.replaceChildren.apply(els.reportCommentList, items);
  }

  function formatReportTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function formatGeometryLabel(type) {
    if (type === "Point") {
      return "Point";
    }
    if (type === "MultiPoint") {
      return "Multiple points";
    }
    if (type === "LineString" || type === "MultiLineString") {
      return "Line";
    }
    if (type === "Polygon" || type === "MultiPolygon") {
      return "Area";
    }
    return "Report";
  }

  function handleCommentSubmit(event) {
    if (event) {
      event.preventDefault();
    }
    const feature = getActiveReport();
    if (!feature) {
      return;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    if (!user) {
      handleCommentSignIn();
      return;
    }
    const text = els.reportCommentInput.value.trim();
    if (!text) {
      showCommentError("Write a comment before posting.");
      els.reportCommentInput.focus();
      return;
    }
    if (text.length > 600) {
      showCommentError("Comments can be up to 600 characters.");
      els.reportCommentInput.focus();
      return;
    }

    const comments = normalizeComments(feature.comments);
    comments.push({
      id: createId("comment"),
      text: text,
      createdBy: user.id,
      createdByName: user.name || user.email || "Community member",
      createdAt: new Date().toISOString()
    });
    feature.comments = comments;

    els.reportCommentInput.value = "";
    clearCommentError();
    persistFeatures();
    renderFeatureList();
    syncMapFeatures();
    renderReportDetail(feature);
    els.reportCommentInput.focus();
    showToast(MESSAGES.commentPosted);
  }

  function handleCommentKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    if (typeof els.reportCommentForm.requestSubmit === "function") {
      els.reportCommentForm.requestSubmit();
    } else {
      handleCommentSubmit();
    }
  }

  function handleCommentSignIn() {
    const id = state.activeReportId;
    if (!id || !C.Auth) {
      return;
    }
    const focusTarget = state.lastReportFocusedElement;
    closeReportDetail({ restoreFocus: false });
    C.Auth.open("signin", {
      message: "Sign in to comment on this report.",
      onAuthenticated: function () {
        state.lastReportFocusedElement = focusTarget && focusTarget.isConnected
          ? focusTarget
          : null;
        openReportDetail(id, { captureFocus: false, focusComments: true });
      }
    });
  }

  function showCommentError(message) {
    els.reportCommentError.textContent = message;
    els.reportCommentError.hidden = false;
    els.reportCommentInput.setAttribute("aria-invalid", "true");
  }

  function clearCommentError() {
    if (!els.reportCommentError) {
      return;
    }
    els.reportCommentError.textContent = "";
    els.reportCommentError.hidden = true;
    if (els.reportCommentInput) {
      els.reportCommentInput.removeAttribute("aria-invalid");
    }
  }

  function handleReportDetailKeydown(event) {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(els.reportDetailModal.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

  function resetDuplicateWarning() {
    state.duplicateMatches = [];
    if (els.duplicateAlert) {
      els.duplicateAlert.hidden = true;
    }
    if (els.duplicateList) {
      els.duplicateList.replaceChildren();
    }
    if (els.modalSave) {
      els.modalSave.textContent = "Save Feature";
      els.modalSave.setAttribute("aria-label", "Save Feature");
    }
  }

  function renderDuplicateWarning() {
    if (!state.pending) {
      resetDuplicateWarning();
      return;
    }

    const matches = findDuplicates(state.pending.geometry, state.features);
    state.duplicateMatches = matches;

    if (matches.length === 0) {
      els.duplicateAlert.hidden = true;
      els.duplicateList.replaceChildren();
      els.modalSave.textContent = "Save Feature";
      els.modalSave.setAttribute("aria-label", "Save Feature");
      return;
    }

    els.duplicateText.textContent = matches.length === 1
      ? "1 report already exists within 30 m and 2 h."
      : matches.length + " reports already exist within 30 m and 2 h.";

    const items = matches.map(function (match) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = match.feature.name;
      item.appendChild(name);
      item.appendChild(document.createTextNode(
        " · " + formatDistance(match.distance) + " away · " + formatAge(match.feature.createdAt)
      ));
      return item;
    });

    els.duplicateList.replaceChildren.apply(els.duplicateList, items);
    els.duplicateAlert.hidden = false;
    els.modalSave.textContent = "Save anyway";
    els.modalSave.setAttribute("aria-label", "Save anyway — possible duplicate");
  }

  function findDuplicates(geometry, features) {
    const point = C.MapView.getGeometryLatLng(geometry);
    if (!point) {
      return [];
    }

    const now = Date.now();
    const matches = [];

    features.forEach(function (feature) {
      const created = new Date(feature.createdAt).getTime();
      if (!isFinite(created) || now - created > DUPLICATE_WINDOW_MS) {
        return;
      }
      const other = C.MapView.getGeometryLatLng(feature.geometry);
      if (!other) {
        return;
      }
      const distance = distanceMeters(point, other);
      if (distance <= DUPLICATE_RADIUS_METERS) {
        matches.push({ feature: feature, distance: distance });
      }
    });

    matches.sort(function (a, b) {
      return a.distance - b.distance;
    });
    return matches.slice(0, 3);
  }

  function distanceMeters(a, b) {
    const radius = 6371000;
    const toRadians = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRadians;
    const dLng = (b.lng - a.lng) * toRadians;
    const lat1 = a.lat * toRadians;
    const lat2 = b.lat * toRadians;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatDistance(meters) {
    if (meters < 1) {
      return "under 1 m";
    }
    return Math.round(meters) + " m";
  }

  function isAdminUser() {
    return Boolean(C.Auth && typeof C.Auth.isAdmin === "function" && C.Auth.isAdmin());
  }

  function isApprovedStatus(status) {
    return Boolean(APPROVED_STATUSES[status]);
  }

  function isFeatureVisible(feature) {
    if (!feature || !feature.id) {
      return false;
    }
    if (isAdminUser() || isApprovedStatus(feature.status)) {
      return true;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    return Boolean(user && feature.createdBy === user.id);
  }

  function getVisibleFeatures() {
    return state.features.filter(isFeatureVisible);
  }

  function isOwnedByCurrentUser(feature) {
    if (!feature || feature.isSample) {
      return false;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    return Boolean(user && feature.createdBy === user.id);
  }

  function getOwnVisibleFeatures() {
    return getVisibleFeatures().filter(isOwnedByCurrentUser);
  }

  function getApprovedFeatures() {
    return state.features.filter(function (feature) {
      return isApprovedStatus(feature.status);
    });
  }

  function canMapFeature(feature) {
    return isAdminUser() || isApprovedStatus(feature.status);
  }

  function syncMapFeatures() {
    if (!C.MapView) {
      return;
    }
    state.features.forEach(function (feature) {
      C.MapView.removeFeature(feature.id);
      if (canMapFeature(feature)) {
        C.MapView.addFeature(feature);
      }
    });
  }

  function hasNearbyLocation() {
    return typeof state.nearby.lat === "number" && typeof state.nearby.lng === "number";
  }

  function featureDistance(feature) {
    if (!hasNearbyLocation()) {
      return null;
    }
    const latlng = C.MapView.getFeatureLatLng(feature);
    if (!latlng) {
      return null;
    }
    return distanceMeters(
      { lat: state.nearby.lat, lng: state.nearby.lng },
      { lat: latlng.lat, lng: latlng.lng }
    );
  }

  function isFeatureNearby(feature) {
    const distance = featureDistance(feature);
    return distance !== null && distance <= state.nearby.radius;
  }

  function getFilteredFeatures() {
    const visible = getVisibleFeatures();
    if (state.mineOnly) {
      return visible.filter(isOwnedByCurrentUser);
    }
    if (!state.nearby.enabled || !hasNearbyLocation()) {
      return visible;
    }
    return visible.filter(isFeatureNearby);
  }

  function formatNearbyDistance(meters) {
    if (meters < 1000) {
      return Math.round(meters) + " m";
    }
    const kilometers = meters / 1000;
    return (kilometers < 10 ? kilometers.toFixed(1) : String(Math.round(kilometers))) + " km";
  }

  function formatRadius(meters) {
    return meters < 1000 ? meters + " m" : (meters / 1000) + " km";
  }

  function renderNearbyControls() {
    if (!els.nearbyToggle || !els.nearbyStatus) {
      return;
    }
    const enabled = state.nearby.enabled;
    els.nearbyToggle.setAttribute("aria-pressed", String(enabled));
    els.nearbyToggle.classList.toggle("is-active", enabled);
    els.nearbyToggle.title = enabled
      ? "Show all reports instead of nearby ones"
      : "Show reports near your location";
    if (els.nearbyRadius) {
      els.nearbyRadius.value = String(state.nearby.radius);
      els.nearbyRadius.disabled = !enabled;
    }

    let message = "Showing all reports.";
    if (enabled) {
      if (!hasNearbyLocation()) {
        const positionStatus = C.Position.getStatus();
        message = positionStatus.state === "denied"
          ? "Location unavailable · showing all reports."
          : "Waiting for your location · showing all reports.";
      } else {
        const count = getVisibleFeatures().filter(isFeatureNearby).length;
        message = count + " " + (count === 1 ? "report" : "reports") +
          " within " + formatRadius(state.nearby.radius) + ".";
      }
    }
    els.nearbyStatus.textContent = message;
  }

  function handleNearbyToggle() {
    state.nearby.enabled = !state.nearby.enabled;
    if (state.nearby.enabled) {
      setFeatureSort("nearest");
    } else if (state.sort === "nearest") {
      setFeatureSort("newest");
    }
    renderFeatureList();
    renderNearbyControls();
  }

  function handleNearbyRadiusChange() {
    const radius = Number(els.nearbyRadius.value);
    if (NEARBY_RADII.indexOf(radius) === -1) {
      return;
    }
    state.nearby.radius = radius;
    renderFeatureList();
    renderNearbyControls();
  }

  function showAllReports() {
    state.nearby.enabled = false;
    if (state.sort === "nearest") {
      setFeatureSort("newest");
    }
    renderFeatureList();
    renderNearbyControls();
  }

  function applyRoleUi() {
    const admin = isAdminUser();
    els.toolButtons.forEach(function (button) {
      button.disabled = admin;
      button.setAttribute("aria-disabled", String(admin));
      button.title = admin ? "Moderator accounts don't add reports" : "";
    });
    if (admin && state.activeTool) {
      draw.deactivate();
    }
    if (els.toolHint) {
      els.toolHint.textContent = admin
        ? "Moderator mode: review reports in the priority queue."
        : (state.activeTool ? TOOL_HINTS[state.activeTool] : "Choose a tool to start drawing on the map.");
    }
  }

  function formatAge(timestamp) {
    const created = new Date(timestamp).getTime();
    if (!isFinite(created)) {
      return "recently";
    }
    const minutes = Math.floor((Date.now() - created) / 60000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return minutes + " min ago";
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (remainder === 0) {
      return hours + " h ago";
    }
    return hours + " h " + remainder + " min ago";
  }

  function handleFormKeydown(event) {
    if (event.key !== "Enter" || event.target.tagName === "BUTTON") {
      return;
    }
    if (event.target.tagName === "TEXTAREA" && event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (typeof els.featureForm.requestSubmit === "function") {
      els.featureForm.requestSubmit();
    } else {
      savePendingFeature();
    }
  }

  function handleModalKeydown(event) {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      els.featureModal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (element) {
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

  function loadSavedFeatures() {
    const result = C.Storage.load();
    const loaded = [];

    if (result.ok) {
      result.features.forEach(function (rawFeature) {
        const feature = normalizeStoredFeature(rawFeature);
        if (feature) {
          loaded.push(feature);
        }
      });
    }

    loaded.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    state.features = loaded;
    if (removeStoredAdminVotes()) {
      persistFeatures();
    }
    syncMapFeatures();

    if (result.ok) {
      setSavedPill(result.savedAt);
    } else {
      setSaveErrorPill();
    }
  }

  function removeStoredAdminVotes() {
    const adminIds = new Set(getAuthUsers().filter(function (user) {
      return user.role === "admin";
    }).map(function (user) {
      return user.id;
    }));
    if (adminIds.size === 0) {
      return false;
    }

    let changed = false;
    state.features.forEach(function (feature) {
      const voterIds = normalizeVoterIds(feature.voterIds);
      const filtered = voterIds.filter(function (id) {
        return !adminIds.has(id);
      });
      if (filtered.length === voterIds.length) {
        return;
      }
      const removed = voterIds.length - filtered.length;
      feature.voterIds = filtered;
      feature.votes = Math.max(filtered.length, normalizeVotes(feature.votes) - removed);
      changed = true;
    });
    return changed;
  }

  function normalizeStoredFeature(rawFeature) {
    if (!rawFeature || typeof rawFeature !== "object") {
      return null;
    }
    if (typeof rawFeature.id !== "string" || !rawFeature.id) {
      return null;
    }
    if (typeof rawFeature.name !== "string" || !rawFeature.name.trim()) {
      return null;
    }
    if (
      !rawFeature.geometry ||
      typeof rawFeature.geometry !== "object" ||
      typeof rawFeature.geometry.type !== "string" ||
      !Array.isArray(rawFeature.geometry.coordinates)
    ) {
      return null;
    }

    const createdAt = new Date(rawFeature.createdAt);
    const voterIds = normalizeVoterIds(rawFeature.voterIds);
    const votes = Math.max(normalizeVotes(rawFeature.votes), voterIds.length);
    return {
      id: rawFeature.id,
      name: rawFeature.name.trim(),
      category: C.categoryMap[rawFeature.category] ? rawFeature.category : "Other",
      notes: typeof rawFeature.notes === "string" ? rawFeature.notes : "",
      photo: typeof rawFeature.photo === "string" && rawFeature.photo.indexOf("data:image/") === 0
        ? rawFeature.photo
        : "",
      position: normalizePosition(rawFeature.position),
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      geometry: rawFeature.geometry,
      votes: votes,
      voterIds: voterIds,
      comments: normalizeComments(rawFeature.comments),
      status: normalizeStatus(rawFeature.status),
      createdBy: typeof rawFeature.createdBy === "string" ? rawFeature.createdBy : null,
      createdByName: typeof rawFeature.createdByName === "string" ? rawFeature.createdByName : "",
      isSample: rawFeature.isSample === true ||
        rawFeature.createdBy === "sample" ||
        rawFeature.createdByName === "Sample data"
    };
  }

  function normalizeStatus(value) {
    return STATUS_MAP[value] ? value : "open";
  }

  function normalizeVotes(value) {
    return typeof value === "number" && isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function normalizeVoterIds(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(new Set(value.filter(function (id) {
      return typeof id === "string" && id;
    })));
  }

  function normalizePosition(raw) {
    const fallback = {
      mode: "unknown",
      label: "Unspecified",
      source: "",
      accuracy: null,
      mock: false,
      timestamp: ""
    };

    if (!raw || typeof raw !== "object") {
      return fallback;
    }

    const known = C.Position && C.Position.modes.some(function (mode) {
      return mode.id === raw.mode;
    });

    if (!known) {
      return fallback;
    }

    return {
      mode: raw.mode,
      label: typeof raw.label === "string" && raw.label
        ? raw.label
        : C.Position.modeLabel(raw.mode),
      source: typeof raw.source === "string" ? raw.source : "",
      accuracy: typeof raw.accuracy === "number" && isFinite(raw.accuracy) && raw.accuracy >= 0
        ? raw.accuracy
        : null,
      mock: raw.mock === true,
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : ""
    };
  }

  function normalizeComments(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const users = getAuthUsers();
    return value.reduce(function (comments, raw, index) {
      if (!raw || typeof raw.text !== "string" || !raw.text.trim()) {
        return comments;
      }
      const createdAt = new Date(raw.createdAt);
      const createdBy = typeof raw.createdBy === "string" ? raw.createdBy : null;
      const knownUser = createdBy
        ? users.find(function (user) {
          return user.id === createdBy;
        })
        : null;
      const createdByName = typeof raw.createdByName === "string" && raw.createdByName.trim()
        ? raw.createdByName.trim()
        : (knownUser ? knownUser.name : "Community member");

      comments.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : "comment-legacy-" + index,
        text: raw.text.trim().slice(0, 600),
        createdBy: createdBy,
        createdByName: createdByName,
        createdAt: Number.isNaN(createdAt.getTime())
          ? new Date().toISOString()
          : createdAt.toISOString()
      });
      return comments;
    }, []);
  }

  function getCommentCount(feature) {
    return feature && Array.isArray(feature.comments) ? feature.comments.length : 0;
  }

  function renderFeatureList(focusVoteId) {
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const canFilterMine = Boolean(user && !isAdminUser());
    if (!canFilterMine) {
      state.mineOnly = false;
    }

    const sorted = getSortedFeatures();
    const ownCount = getOwnVisibleFeatures().length;
    const nearbyActive = !state.mineOnly && state.nearby.enabled && hasNearbyLocation();
    const hiddenByNearby = nearbyActive &&
      sorted.length === 0 &&
      getVisibleFeatures().length > 0;

    els.featureCount.textContent = "(" + sorted.length + ")";
    els.emptyState.hidden = sorted.length > 0;
    els.featureList.hidden = sorted.length === 0;
    if (els.emptyStateText) {
      if (state.mineOnly) {
        els.emptyStateText.textContent =
          "You haven't raised any reports yet. Use the tools above to report an issue.";
      } else {
        els.emptyStateText.textContent = hiddenByNearby
          ? "No reports within " + formatRadius(state.nearby.radius) + " of you."
          : "No features yet. Use the tools above to start mapping.";
      }
    }
    if (els.nearbyEmptyBtn) {
      els.nearbyEmptyBtn.hidden = state.mineOnly || !hiddenByNearby;
    }
    if (els.sampleBtn) {
      els.sampleBtn.hidden = state.mineOnly || state.features.length > 0;
    }
    if (els.featureMineToggle) {
      els.featureMineToggle.hidden = !canFilterMine;
      els.featureMineToggle.setAttribute("aria-pressed", String(state.mineOnly));
      els.featureMineToggle.title = state.mineOnly
        ? "Show all reports"
        : "Show only reports you raised";
      els.featureMineToggle.setAttribute(
        "aria-label",
        state.mineOnly ? "Show all reports" : "Show only reports you raised"
      );
    }
    if (els.featureMineCount) {
      els.featureMineCount.textContent = String(ownCount);
    }
    if (els.nearbyBar) {
      els.nearbyBar.hidden = state.mineOnly;
    }

    const rows = sorted.map(function (feature) {
      return buildFeatureRow(feature);
    });

    els.featureList.replaceChildren.apply(els.featureList, rows);
    renderAdminQueueEntry();
    renderCommunityCard();
    renderNearbyControls();
    refreshIcons();

    if (focusVoteId) {
      const nextVote = Array.from(els.featureList.querySelectorAll(".vote-btn")).find(function (button) {
        return button.dataset.voteId === focusVoteId;
      });
      if (nextVote) {
        nextVote.focus();
      }
    }
  }

  function getSortedFeatures() {
    return getFilteredFeatures().sort(function (a, b) {
      if (state.sort === "nearest" && hasNearbyLocation()) {
        const aDistance = featureDistance(a);
        const bDistance = featureDistance(b);
        if (aDistance !== null && bDistance !== null && aDistance !== bDistance) {
          return aDistance - bDistance;
        }
      }
      if (state.sort === "votes") {
        const difference = (b.votes || 0) - (a.votes || 0);
        if (difference !== 0) {
          return difference;
        }
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function handleSortChange() {
    setFeatureSort(els.featureSort.value);
    renderFeatureList();
  }

  function handleMineFilterToggle() {
    state.mineOnly = !state.mineOnly;
    renderFeatureList();
  }

  function setFeatureSort(value) {
    state.sort = value === "votes"
      ? "votes"
      : (value === "nearest" ? "nearest" : "newest");
    if (els.featureSort) {
      els.featureSort.value = state.sort;
    }
  }

  function buildFeatureRow(feature) {
    const category = C.getCategory(feature.category);
    const row = document.createElement("li");
    row.className = "feature-row";
    row.dataset.id = feature.id;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "feature-open";
    openButton.setAttribute("aria-label", "Open report for " + feature.name);
    openButton.addEventListener("click", function () {
      openReportDetail(feature.id);
    });

    const dot = document.createElement("span");
    dot.className = "feature-dot";
    dot.style.backgroundColor = category.color;
    dot.setAttribute("aria-hidden", "true");

    const main = document.createElement("span");
    main.className = "feature-main";

    const name = document.createElement("span");
    name.className = "feature-name";
    name.textContent = feature.name;

    const meta = document.createElement("span");
    meta.className = "feature-meta";

    const categoryLabel = document.createElement("span");
    categoryLabel.className = "feature-category";
    categoryLabel.textContent = category.name;

    meta.appendChild(categoryLabel);
    if (!state.mineOnly && isOwnedByCurrentUser(feature)) {
      const owner = document.createElement("span");
      owner.className = "feature-owner";
      owner.textContent = "Your report";
      owner.title = "You raised this report";
      meta.appendChild(owner);
    }
    if (feature.status && feature.status !== "open") {
      meta.appendChild(buildStatusPill(feature.status));
    }
    const distance = featureDistance(feature);
    if (distance !== null) {
      const distanceLabel = document.createElement("span");
      distanceLabel.className = "feature-distance";
      distanceLabel.textContent = formatNearbyDistance(distance) + " away";
      distanceLabel.title = "Distance from your current location";
      meta.appendChild(distanceLabel);
    }

    const position = feature.position || normalizePosition(null);
    const accuracy = document.createElement("span");
    accuracy.className = "accuracy-badge";
    if (C.Position.isBadgeMock(position)) {
      accuracy.classList.add("is-mock");
    }
    if (typeof position.accuracy !== "number") {
      accuracy.classList.add("is-unknown");
    }
    accuracy.textContent = C.Position.badgeText(position);
    accuracy.title = C.Position.badgeTitle(position);
    meta.appendChild(accuracy);

    const commentCount = getCommentCount(feature);
    if (commentCount > 0) {
      const comments = document.createElement("span");
      comments.className = "feature-comments";
      comments.textContent = commentCount + (commentCount === 1 ? " comment" : " comments");
      comments.title = "Open the report to read comments";
      meta.appendChild(comments);
    }

    main.appendChild(name);
    main.appendChild(meta);
    openButton.appendChild(dot);
    openButton.appendChild(main);

    let photoButton = null;
    if (feature.photo) {
      photoButton = document.createElement("button");
      photoButton.type = "button";
      photoButton.className = "feature-photo";
      photoButton.setAttribute("aria-label", "View photo for " + feature.name);

      const photo = document.createElement("img");
      photo.src = feature.photo;
      photo.alt = "";
      photo.loading = "lazy";
      photoButton.appendChild(photo);
      photoButton.addEventListener("click", function (event) {
        event.stopPropagation();
        openPhotoViewer(feature);
      });
    }

    row.appendChild(openButton);
    if (photoButton) {
      row.appendChild(photoButton);
    }
    row.appendChild(buildVoteControl(feature));

    if (canDeleteFeature(feature)) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.id = feature.id;

      if (state.pendingDeleteId === feature.id) {
        setDeleteConfirmState(deleteButton, feature);
        state.pendingDeleteButton = deleteButton;
      } else {
        setDeleteIdleState(deleteButton, feature);
      }

      deleteButton.addEventListener("click", function (event) {
        event.stopPropagation();
        handleDeleteClick(feature.id, deleteButton);
      });

      row.appendChild(deleteButton);
    }

    return row;
  }

  function buildStatusPill(statusId) {
    const status = STATUS_MAP[statusId] || STATUS_MAP.open;
    const pill = document.createElement("span");
    pill.className = "status-pill status-" + status.id;
    pill.textContent = status.label;
    return pill;
  }

  function buildVoteControl(feature) {
    if (!isApprovedStatus(feature.status)) {
      return buildVoteReadonly(feature, true);
    }
    if (isAdminUser()) {
      return buildVoteReadonly(feature, false);
    }
    return buildVoteButton(feature);
  }

  function buildVoteReadonly(feature, locked) {
    const count = normalizeVotes(feature.votes);
    const chip = document.createElement("span");
    chip.className = "vote-readonly" + (locked ? " is-locked" : "");
    chip.title = locked
      ? "Support opens after an admin approves this report"
      : "Community support count. Moderator accounts don't vote.";
    chip.setAttribute(
      "aria-label",
      count + (count === 1 ? " vote" : " votes") + ". " +
        (locked ? "Not open for support yet." : "Moderator view; voting is read-only.")
    );

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", locked ? "lock" : "arrow-big-up");
    icon.setAttribute("aria-hidden", "true");

    const value = document.createElement("span");
    value.textContent = String(count);

    chip.appendChild(icon);
    chip.appendChild(value);
    return chip;
  }

  function buildVoteButton(feature) {
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const voterIds = normalizeVoterIds(feature.voterIds);
    const supported = Boolean(user && voterIds.indexOf(user.id) !== -1);
    const button = document.createElement("button");

    button.type = "button";
    button.className = "vote-btn" + (supported ? " is-voted" : "");
    button.dataset.voteId = feature.id;
    button.setAttribute("aria-pressed", String(supported));
    button.title = supported
      ? "Remove your support"
      : (user ? "Support this report" : "Sign in to support");
    button.setAttribute(
      "aria-label",
      supported
        ? "Remove your support for " + feature.name
        : (user ? "Support " + feature.name : "Sign in to support " + feature.name)
    );

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "arrow-big-up");
    icon.setAttribute("aria-hidden", "true");

    const count = document.createElement("span");
    count.textContent = String(normalizeVotes(feature.votes));

    button.appendChild(icon);
    button.appendChild(count);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      handleVoteClick(feature.id);
    });
    return button;
  }

  function canDeleteFeature(feature) {
    if (!feature) {
      return false;
    }
    if (C.Auth && C.Auth.isAdmin()) {
      return true;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    return Boolean(user && feature.createdBy === user.id);
  }

  function handleVoteClick(id) {
    if (isAdminUser()) {
      showToast(MESSAGES.adminNoVote, "warn");
      return;
    }
    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!feature || !isApprovedStatus(feature.status)) {
      showToast("This report isn't open for support yet.", "warn");
      return;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    if (!user) {
      C.Auth.open("signin", {
        message: "Sign in to support this report.",
        onAuthenticated: function () {
          toggleVote(id);
        }
      });
      return;
    }
    toggleVote(id);
  }

  function toggleVote(id) {
    if (isAdminUser()) {
      showToast(MESSAGES.adminNoVote, "warn");
      return;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!user || !feature || !isApprovedStatus(feature.status)) {
      return;
    }

    const voterIds = normalizeVoterIds(feature.voterIds);
    const index = voterIds.indexOf(user.id);
    let added = false;

    if (index === -1) {
      voterIds.push(user.id);
      feature.votes = normalizeVotes(feature.votes) + 1;
      added = true;
    } else {
      voterIds.splice(index, 1);
      feature.votes = Math.max(0, normalizeVotes(feature.votes) - 1);
    }
    feature.voterIds = voterIds;

    persistFeatures();
    renderFeatureList(id);
    showToast(added ? MESSAGES.supportAdded : MESSAGES.supportRemoved);
  }

  function setDeleteIdleState(button, feature) {
    button.classList.remove("is-confirming");
    button.setAttribute("aria-label", "Delete " + feature.name);
    button.replaceChildren();

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "trash-2");
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);
  }

  function setDeleteConfirmState(button, feature) {
    button.classList.add("is-confirming");
    button.setAttribute("aria-label", "Confirm delete " + feature.name);
    button.textContent = "Confirm?";
  }

  function handleDeleteClick(id, button) {
    if (state.pendingDeleteId === id) {
      deleteFeature(id);
      return;
    }

    resetPendingDelete(true);

    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!feature) {
      return;
    }
    if (!canDeleteFeature(feature)) {
      showToast(MESSAGES.deleteDenied, "warn");
      return;
    }

    state.pendingDeleteId = id;
    state.pendingDeleteButton = button;
    setDeleteConfirmState(button, feature);

    state.deleteTimer = window.setTimeout(function () {
      if (state.pendingDeleteId !== id) {
        return;
      }
      const currentFeature = state.features.find(function (item) {
        return item.id === id;
      });
      if (button.isConnected && currentFeature) {
        setDeleteIdleState(button, currentFeature);
        refreshIcons();
      }
      state.pendingDeleteId = null;
      state.pendingDeleteButton = null;
      state.deleteTimer = null;
    }, 3000);
  }

  function resetPendingDelete(restoreButton) {
    if (state.deleteTimer) {
      window.clearTimeout(state.deleteTimer);
      state.deleteTimer = null;
    }

    if (
      restoreButton &&
      state.pendingDeleteButton &&
      state.pendingDeleteButton.isConnected
    ) {
      const feature = state.features.find(function (item) {
        return item.id === state.pendingDeleteId;
      });
      if (feature) {
        setDeleteIdleState(state.pendingDeleteButton, feature);
        refreshIcons();
      }
    }

    state.pendingDeleteId = null;
    state.pendingDeleteButton = null;
  }

  function deleteFeature(id) {
    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!feature) {
      resetPendingDelete(false);
      return;
    }

    resetPendingDelete(false);
    C.MapView.removeFeature(id);
    state.features = state.features.filter(function (item) {
      return item.id !== id;
    });

    renderFeatureList();
    updateExportAvailability();
    persistFeatures();
    showToast(MESSAGES.deleted);
  }

  function focusFeature(id) {
    const feature = state.features.find(function (item) {
      return item.id === id;
    });
    if (!feature) {
      return;
    }

    C.MapView.focusFeature(feature);

    if (isMobile()) {
      setSidebar(false);
    }
  }

  function handleAuthChange(event) {
    const detail = event.detail || {};
    const user = detail.user || (C.Auth ? C.Auth.getCurrentUser() : null);

    if (!user || user.role === "admin") {
      state.mineOnly = false;
    }

    if (user && user.role === "admin") {
      state.nearby.enabled = false;
      if (state.sort === "nearest") {
        setFeatureSort("votes");
      }
    } else if (!user && detail.reason === "logout") {
      state.nearby.enabled = true;
      if (state.sort === "votes") {
        setFeatureSort("nearest");
      }
    }

    if (!user && els.adminModal && !els.adminModal.hidden) {
      closeAdminModal();
    }
    if (!user && els.leaderboardModal && !els.leaderboardModal.hidden) {
      closeLeaderboard();
    }

    syncMapFeatures();
    applyRoleUi();
    renderFeatureList();
    updateExportAvailability();

    if (state.activeReportId && els.reportDetailModal && !els.reportDetailModal.hidden) {
      const activeFeature = getActiveReport();
      if (!activeFeature || !isFeatureVisible(activeFeature)) {
        closeReportDetail();
      } else {
        renderReportDetail(activeFeature);
      }
    }

    if (detail.reason === "login" && user) {
      showToast("Signed in as " + user.name);
    } else if (detail.reason === "register" && user) {
      showToast("Account created — welcome, " + user.name);
    } else if (detail.reason === "logout") {
      showToast("Signed out");
    }
  }

  function getAuthUsers() {
    if (!C.Auth || typeof C.Auth.getUsers !== "function") {
      return [];
    }
    return C.Auth.getUsers();
  }

  function getContributorOverview() {
    if (!C.Contributors) {
      return null;
    }
    return C.Contributors.summarize(state.features, getAuthUsers());
  }

  function getInitials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("") || "?";
  }

  function setElementIcon(element, iconName) {
    if (!element) {
      return;
    }
    element.replaceChildren();
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", iconName);
    icon.setAttribute("aria-hidden", "true");
    element.appendChild(icon);
  }

  function pluralLabel(count, singular, plural) {
    return count + " " + (count === 1 ? singular : plural);
  }

  function formatPoints(points) {
    return points + (points === 1 ? " pt" : " pts");
  }

  function renderCommunityCard() {
    if (!els.impactCard || !C.Contributors) {
      return;
    }
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const overview = getContributorOverview();
    if (!overview) {
      return;
    }
    const profile = user ? C.Contributors.getProfile(overview, user.id) : null;
    const top = overview.leaderboard[0];

    if (isAdminUser()) {
      els.impactCard.setAttribute("aria-label", "Open community rankings as moderator");
      els.impactCard.className = "impact-card tone-blue";
      els.impactIcon.className = "impact-icon";
      setElementIcon(els.impactIcon, "shield-check");
      els.impactTitle.textContent = "Community rankings";
      els.impactPoints.textContent = "—";
      els.impactSub.textContent = "Moderator view · not ranked";
      els.impactProgress.hidden = true;
      els.impactProgressBar.style.width = "0%";
      els.impactMeta.textContent = "Reporters only · " +
        pluralLabel(overview.leaderboard.length, "contributor", "contributors") + " ranked";
      refreshIcons();
      return;
    }

    if (profile) {
      els.impactCard.setAttribute(
        "aria-label",
        "Open your community impact: " + formatPoints(profile.points) + ", " + profile.level.name
      );
      els.impactCard.className = "impact-card tone-" + profile.level.tone;
      els.impactIcon.className = "impact-icon";
      setElementIcon(els.impactIcon, profile.level.icon);
      els.impactTitle.textContent = profile.reports > 0 ? "Your impact" : "Start your impact";
      els.impactPoints.textContent = formatPoints(profile.points);
      els.impactSub.textContent = profile.level.name +
        (profile.rank ? " · Rank #" + profile.rank : " · Unranked");
      els.impactProgress.hidden = false;
      els.impactProgressBar.style.width = Math.round(profile.progress * 100) + "%";
      if (profile.nextLevel) {
        els.impactMeta.textContent = pluralLabel(profile.unlockedBadges, "badge", "badges") +
          " · " + formatPoints(profile.pointsToNext) + " to " + profile.nextLevel.name;
      } else {
        els.impactMeta.textContent = pluralLabel(profile.unlockedBadges, "badge", "badges") +
          " · Top rank reached";
      }
    } else {
      els.impactCard.setAttribute("aria-label", "Open community leaderboard");
      els.impactCard.className = "impact-card tone-amber";
      els.impactIcon.className = "impact-icon";
      setElementIcon(els.impactIcon, "trophy");
      els.impactTitle.textContent = "Community ranks";
      els.impactPoints.textContent = "—";
      els.impactSub.textContent = "Sign in to earn points and badges.";
      els.impactProgress.hidden = true;
      els.impactProgressBar.style.width = "0%";
      els.impactMeta.textContent = top
        ? "Leading: " + top.name + " · " + formatPoints(top.points)
        : "Be the first contributor on the board.";
    }
    refreshIcons();
  }

  function openLeaderboard() {
    if (
      !els.leaderboardModal ||
      !els.leaderboardModal.hidden ||
      (els.authModal && !els.authModal.hidden) ||
      (els.adminModal && !els.adminModal.hidden)
    ) {
      return;
    }
    const active = document.activeElement;
    state.lastLeaderboardFocusedElement = active && active !== document.body && active.offsetParent !== null
      ? active
      : els.impactCard;
    renderLeaderboard();
    els.leaderboardModal.hidden = false;
    if (els.appShell) {
      els.appShell.inert = true;
    }
    refreshIcons();
    els.leaderboardClose.focus();
  }

  function closeLeaderboard() {
    if (!els.leaderboardModal || els.leaderboardModal.hidden) {
      return;
    }
    els.leaderboardModal.hidden = true;
    if (els.appShell) {
      els.appShell.inert = false;
    }
    const target = state.lastLeaderboardFocusedElement;
    state.lastLeaderboardFocusedElement = null;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function renderLeaderboard() {
    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    const overview = getContributorOverview();
    if (!overview) {
      return;
    }
    const profile = user ? C.Contributors.getProfile(overview, user.id) : null;
    const moderator = Boolean(user && user.role === "admin");

    els.leaderboardSelf.replaceChildren(buildLeaderboardSelf(profile, overview, user));

    if (els.leaderboardBadgeSection) {
      els.leaderboardBadgeSection.hidden = moderator;
    }
    if (els.leaderboardPointsNote) {
      els.leaderboardPointsNote.hidden = moderator;
    }
    if (els.leaderboardSubtitle) {
      els.leaderboardSubtitle.textContent = moderator
        ? "Community rankings are for reporters. Moderator accounts review reports but don't compete."
        : "Earn points for reporting issues, receiving community support, and helping close the loop.";
    }

    const badges = profile
      ? profile.badges
      : C.Contributors.BADGES.map(function (badge) {
        return {
          id: badge.id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          tone: badge.tone,
          value: 0,
          target: badge.target,
          unlocked: false
        };
      });
    const badgeCards = badges.map(function (badge) {
      return buildBadgeCard(badge, Boolean(profile));
    });
    els.leaderboardBadges.replaceChildren.apply(els.leaderboardBadges, badgeCards);
    els.badgeSummary.textContent = moderator
      ? "Moderators don't earn badges"
      : (profile
        ? profile.unlockedBadges + " of " + badges.length + " unlocked"
        : badges.length + " badges to earn");

    const currentUserId = user ? user.id : null;
    const rankingItems = overview.leaderboard.map(function (entry) {
      return buildRankingRow(entry, currentUserId);
    });
    els.leaderboardList.replaceChildren.apply(els.leaderboardList, rankingItems);
    els.leaderboardList.hidden = rankingItems.length === 0;
    els.leaderboardEmpty.hidden = rankingItems.length > 0;
    els.leaderboardScope.textContent = moderator
      ? "Reporters only"
      : pluralLabel(overview.leaderboard.length, "contributor", "contributors");
    refreshIcons();
  }

  function buildLeaderboardSelf(profile, overview, user) {
    const card = document.createElement("div");

    if (user && user.role === "admin") {
      card.className = "leader-self-card is-guest is-moderator tone-blue";
      const icon = document.createElement("span");
      icon.className = "leader-guest-icon";
      setElementIcon(icon, "shield-check");

      const copy = document.createElement("div");
      copy.className = "leader-guest-copy";
      const title = document.createElement("strong");
      title.textContent = "Moderator view";
      const text = document.createElement("p");
      text.textContent = "Admins review and moderate reports. Rankings and badges are reserved for reporters.";
      copy.appendChild(title);
      copy.appendChild(text);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary leader-signin-btn leader-moderator-btn";
      button.textContent = "Open priority queue";
      button.addEventListener("click", function () {
        closeLeaderboard();
        openAdminModal();
      });

      card.appendChild(icon);
      card.appendChild(copy);
      card.appendChild(button);
      return card;
    }

    if (!profile) {
      card.className = "leader-self-card is-guest";
      const icon = document.createElement("span");
      icon.className = "leader-guest-icon";
      setElementIcon(icon, "trophy");

      const copy = document.createElement("div");
      copy.className = "leader-guest-copy";
      const title = document.createElement("strong");
      title.textContent = "Join the community rankings";
      const text = document.createElement("p");
      text.textContent = "Sign in to earn points for reports and support, then unlock badges as your impact grows.";
      copy.appendChild(title);
      copy.appendChild(text);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary leader-signin-btn";
      button.id = "leaderboardSignInBtn";
      button.textContent = "Sign in to compete";

      card.appendChild(icon);
      card.appendChild(copy);
      card.appendChild(button);
      return card;
    }

    card.className = "leader-self-card";
    const avatar = document.createElement("span");
    avatar.className = "leader-self-avatar";
    avatar.textContent = getInitials(profile.name);

    const main = document.createElement("div");
    main.className = "leader-self-main";

    const heading = document.createElement("div");
    heading.className = "leader-self-heading";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const level = document.createElement("span");
    level.className = "level-pill tone-" + profile.level.tone;
    const levelIcon = document.createElement("span");
    levelIcon.className = "level-pill-icon";
    setElementIcon(levelIcon, profile.level.icon);
    const levelText = document.createElement("span");
    levelText.textContent = profile.level.name;
    level.appendChild(levelIcon);
    level.appendChild(levelText);
    heading.appendChild(name);
    heading.appendChild(level);

    const rank = document.createElement("p");
    rank.className = "leader-self-rank";
    rank.textContent = profile.rank
      ? "Rank #" + profile.rank + " of " + overview.leaderboard.length + " active contributors"
      : "Not ranked yet — add a report or support one to join the board.";

    const stats = document.createElement("div");
    stats.className = "leader-self-stats";
    [
      ["Points", profile.points],
      ["Reports", profile.reports],
      ["Votes received", profile.votesReceived],
      ["Badges", profile.unlockedBadges]
    ].forEach(function (entry) {
      const stat = document.createElement("span");
      stat.className = "leader-stat";
      const value = document.createElement("strong");
      value.textContent = String(entry[1]);
      const label = document.createElement("span");
      label.textContent = entry[0];
      stat.appendChild(value);
      stat.appendChild(label);
      stats.appendChild(stat);
    });

    const progress = document.createElement("div");
    progress.className = "leader-progress";
    const progressFill = document.createElement("span");
    progressFill.style.width = Math.round(profile.progress * 100) + "%";
    progress.appendChild(progressFill);

    const progressLabel = document.createElement("span");
    progressLabel.className = "leader-progress-label";
    progressLabel.textContent = profile.nextLevel
      ? formatPoints(profile.pointsToNext) + " to " + profile.nextLevel.name
      : "Top rank reached — legend status.";

    main.appendChild(heading);
    main.appendChild(rank);
    main.appendChild(stats);
    main.appendChild(progress);
    main.appendChild(progressLabel);
    card.appendChild(avatar);
    card.appendChild(main);
    return card;
  }

  function buildBadgeCard(badge, hasProfile) {
    const card = document.createElement("div");
    card.className = "badge-card tone-" + badge.tone + (badge.unlocked ? " is-unlocked" : " is-locked");

    const icon = document.createElement("span");
    icon.className = "badge-icon";
    setElementIcon(icon, badge.icon);

    const copy = document.createElement("div");
    copy.className = "badge-copy";
    const name = document.createElement("strong");
    name.textContent = badge.name;
    const description = document.createElement("span");
    description.className = "badge-description";
    description.textContent = badge.description;
    copy.appendChild(name);
    copy.appendChild(description);

    if (badge.unlocked) {
      const stateLabel = document.createElement("span");
      stateLabel.className = "badge-state is-earned";
      stateLabel.textContent = "Unlocked";
      copy.appendChild(stateLabel);
    } else if (hasProfile) {
      const meter = document.createElement("span");
      meter.className = "badge-meter";
      const fill = document.createElement("span");
      fill.style.width = Math.min(100, Math.round((badge.value / badge.target) * 100)) + "%";
      meter.appendChild(fill);
      const progress = document.createElement("span");
      progress.className = "badge-progress-label";
      progress.textContent = badge.metric === "level"
        ? "Rank " + badge.value + " of " + badge.target
        : badge.value + " / " + badge.target + " " + badge.metricLabel;
      copy.appendChild(meter);
      copy.appendChild(progress);
    } else {
      const stateLabel = document.createElement("span");
      stateLabel.className = "badge-state";
      stateLabel.textContent = "Sign in to unlock";
      copy.appendChild(stateLabel);
    }

    card.appendChild(icon);
    card.appendChild(copy);
    return card;
  }

  function buildRankingRow(profile, currentUserId) {
    const row = document.createElement("li");
    const isCurrent = Boolean(currentUserId && profile.id === currentUserId);
    row.className = "ranking-row" + (isCurrent ? " is-you" : "") +
      (profile.rank <= 3 ? " is-podium" : "");

    const position = document.createElement("span");
    position.className = "ranking-position";
    position.textContent = String(profile.rank);

    const avatar = document.createElement("span");
    avatar.className = "ranking-avatar tone-" + profile.level.tone;
    avatar.textContent = getInitials(profile.name);

    const main = document.createElement("span");
    main.className = "ranking-main";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    if (isCurrent) {
      const you = document.createElement("span");
      you.className = "you-tag";
      you.textContent = "You";
      name.appendChild(you);
    }
    const meta = document.createElement("span");
    meta.className = "ranking-meta";
    meta.textContent = profile.level.name + " · " +
      pluralLabel(profile.unlockedBadges, "badge", "badges");
    main.appendChild(name);
    main.appendChild(meta);

    const points = document.createElement("span");
    points.className = "ranking-points";
    const pointsValue = document.createElement("strong");
    pointsValue.textContent = String(profile.points);
    const pointsLabel = document.createElement("span");
    pointsLabel.textContent = profile.points === 1 ? "pt" : "pts";
    points.appendChild(pointsValue);
    points.appendChild(pointsLabel);

    row.appendChild(position);
    row.appendChild(avatar);
    row.appendChild(main);
    row.appendChild(points);
    return row;
  }

  function handleLeaderboardKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLeaderboard();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(els.leaderboardModal.querySelectorAll(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

  function renderAdminQueueEntry() {
    if (!els.adminQueueBtn) {
      return;
    }
    const admin = Boolean(C.Auth && C.Auth.isAdmin());
    els.adminQueueBtn.hidden = !admin;
    if (!admin) {
      return;
    }
    const total = state.features.length;
    const pending = state.features.filter(function (feature) {
      return feature.status === "pending";
    }).length;
    els.adminQueueMeta.textContent = total + (total === 1 ? " report" : " reports") +
      (pending > 0 ? " · " + pending + " awaiting review" : "");
  }

  function openAdminModal() {
    if (!C.Auth || !C.Auth.isAdmin()) {
      if (C.Auth && !C.Auth.isSignedIn()) {
        C.Auth.open("signin", {
          message: "Sign in with the admin account to view the priority queue.",
          onAuthenticated: function (user) {
            if (user.role === "admin") {
              openAdminModal();
            } else {
              showToast("This account doesn't have admin access.", "warn");
            }
          }
        });
      } else {
        showToast("Admin access required.", "warn");
      }
      return;
    }
    if (!els.adminModal.hidden) {
      return;
    }
    const active = document.activeElement;
    state.lastAdminFocusedElement = active && active !== document.body && active.offsetParent !== null
      ? active
      : els.adminQueueBtn;
    state.adminView = "queue";
    setAdminView("queue");
    renderAdminModal();
    els.adminModal.hidden = false;
    if (els.appShell) {
      els.appShell.inert = true;
    }
    refreshIcons();
    els.adminClose.focus();
  }

  function closeAdminModal() {
    if (!els.adminModal || els.adminModal.hidden) {
      return;
    }
    els.adminModal.hidden = true;
    if (els.appShell) {
      els.appShell.inert = false;
    }
    const target = state.lastAdminFocusedElement;
    state.lastAdminFocusedElement = null;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function setAdminView(view, focusTab) {
    const analytics = view === "analytics";
    state.adminView = analytics ? "analytics" : "queue";
    els.adminTabQueue.classList.toggle("is-active", !analytics);
    els.adminTabQueue.setAttribute("aria-selected", String(!analytics));
    els.adminTabQueue.tabIndex = analytics ? -1 : 0;
    els.adminTabAnalytics.classList.toggle("is-active", analytics);
    els.adminTabAnalytics.setAttribute("aria-selected", String(analytics));
    els.adminTabAnalytics.tabIndex = analytics ? 0 : -1;
    els.adminQueuePanel.hidden = analytics;
    els.adminAnalyticsPanel.hidden = !analytics;
    if (els.adminSubtitle) {
      els.adminSubtitle.textContent = analytics
        ? "A live view of report health, support, and contributor momentum. Moderators are not ranked."
        : "Approve new reports, reject invalid ones, then track work status. Moderator accounts don't earn points.";
    }
    if (analytics) {
      renderAdminAnalytics();
    } else {
      renderAdminStats();
    }
    refreshIcons();
    if (focusTab) {
      (analytics ? els.adminTabAnalytics : els.adminTabQueue).focus();
    }
  }

  function handleAdminTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" &&
      event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const analytics = event.key === "ArrowRight" || event.key === "End";
    setAdminView(analytics ? "analytics" : "queue", true);
  }

  function buildAnalyticsData() {
    const total = state.features.length;
    const votes = state.features.reduce(function (sum, feature) {
      return sum + normalizeVotes(feature.votes);
    }, 0);
    const statusCounts = {};
    STATUSES.forEach(function (status) {
      statusCounts[status.id] = 0;
    });
    const categories = C.categories.map(function (category) {
      return {
        name: category.name,
        color: category.color,
        reports: 0,
        votes: 0
      };
    });
    const categoryMap = {};
    categories.forEach(function (category) {
      categoryMap[category.name] = category;
    });

    state.features.forEach(function (feature) {
      const statusId = normalizeStatus(feature.status);
      statusCounts[statusId] += 1;
      const category = categoryMap[C.getCategory(feature.category).name];
      if (category) {
        category.reports += 1;
        category.votes += normalizeVotes(feature.votes);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      days.push({
        date: date,
        key: date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate(),
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        count: 0
      });
    }
    const dayMap = {};
    days.forEach(function (day) {
      dayMap[day.key] = day;
    });
    state.features.forEach(function (feature) {
      const created = new Date(feature.createdAt);
      if (Number.isNaN(created.getTime())) {
        return;
      }
      const key = created.getFullYear() + "-" + (created.getMonth() + 1) + "-" + created.getDate();
      if (dayMap[key]) {
        dayMap[key].count += 1;
      }
    });

    const resolved = statusCounts.resolved;
    const overview = getContributorOverview() || {
      leaderboard: [],
      totals: { contributors: 0 }
    };
    return {
      total: total,
      votes: votes,
      resolved: resolved,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      averageSupport: total > 0 ? votes / total : 0,
      statusCounts: statusCounts,
      categories: categories.filter(function (category) {
        return category.reports > 0;
      }),
      days: days,
      lastSevenDays: days.reduce(function (sum, day) {
        return sum + day.count;
      }, 0),
      overview: overview
    };
  }

  function renderAdminAnalytics() {
    if (!els.analyticsKpis || !els.analyticsGrid) {
      return;
    }
    const data = buildAnalyticsData();
    const kpis = [
      buildAnalyticsKpi("Resolution rate", data.resolutionRate + "%", data.resolved + " of " + data.total + " resolved", "is-resolution"),
      buildAnalyticsKpi("Active contributors", String(data.overview.totals.contributors), "ranked in this browser", "is-people"),
      buildAnalyticsKpi("Average support", data.averageSupport.toFixed(1), "votes per report", "is-support"),
      buildAnalyticsKpi("Last 7 days", String(data.lastSevenDays), "new reports this week", "is-recent")
    ];
    els.analyticsKpis.replaceChildren.apply(els.analyticsKpis, kpis);

    const charts = [
      buildStatusChart(data),
      buildCategoryChart(data),
      buildTrendChart(data),
      buildContributorChart(data)
    ];
    els.analyticsGrid.replaceChildren.apply(els.analyticsGrid, charts);
    refreshIcons();
  }

  function buildAnalyticsKpi(label, value, note, tone) {
    const card = document.createElement("div");
    card.className = "analytics-kpi " + tone;
    const labelElement = document.createElement("span");
    labelElement.className = "analytics-kpi-label";
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.className = "analytics-kpi-value";
    valueElement.textContent = value;
    const noteElement = document.createElement("span");
    noteElement.className = "analytics-kpi-note";
    noteElement.textContent = note;
    card.appendChild(labelElement);
    card.appendChild(valueElement);
    card.appendChild(noteElement);
    return card;
  }

  function buildChartCard(title, subtitle, content, extraClass) {
    const card = document.createElement("section");
    card.className = "chart-card" + (extraClass ? " " + extraClass : "");
    const head = document.createElement("div");
    head.className = "chart-card-head";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const sub = document.createElement("p");
    sub.textContent = subtitle;
    head.appendChild(heading);
    head.appendChild(sub);
    card.appendChild(head);
    card.appendChild(content);
    return card;
  }

  function buildChartEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = message;
    return empty;
  }

  function createSvgElement(name, attributes) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    return element;
  }

  function buildStatusChart(data) {
    const content = document.createElement("div");
    content.className = "status-chart";
    const svg = createSvgElement("svg", {
      viewBox: "0 0 120 120",
      role: "img",
      "aria-label": "Status mix for " + data.total + " reports"
    });
    svg.classList.add("donut-chart");

    const circumference = 2 * Math.PI * 40;
    svg.appendChild(createSvgElement("circle", {
      cx: "60",
      cy: "60",
      r: "40",
      fill: "none",
      "stroke-width": "13",
      "class": "donut-track"
    }));

    let offset = 0;
    STATUSES.forEach(function (status) {
      const count = data.statusCounts[status.id] || 0;
      if (count === 0 || data.total === 0) {
        return;
      }
      const length = (count / data.total) * circumference;
      const circle = createSvgElement("circle", {
        cx: "60",
        cy: "60",
        r: "40",
        fill: "none",
        stroke: STATUS_COLORS[status.id],
        "stroke-width": "13",
        "stroke-linecap": "butt",
        "stroke-dasharray": length + " " + (circumference - length),
        "stroke-dashoffset": String(-offset)
      });
      circle.setAttribute("transform", "rotate(-90 60 60)");
      svg.appendChild(circle);
      offset += length;
    });

    const totalText = createSvgElement("text", {
      x: "60",
      y: "58",
      "text-anchor": "middle",
      "class": "donut-total"
    });
    totalText.textContent = String(data.total);
    const totalLabel = createSvgElement("text", {
      x: "60",
      y: "74",
      "text-anchor": "middle",
      "class": "donut-caption"
    });
    totalLabel.textContent = "reports";
    svg.appendChild(totalText);
    svg.appendChild(totalLabel);

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    STATUSES.forEach(function (status) {
      const count = data.statusCounts[status.id] || 0;
      const row = document.createElement("div");
      row.className = "chart-legend-row";
      const dot = document.createElement("span");
      dot.className = "chart-legend-dot";
      dot.style.backgroundColor = STATUS_COLORS[status.id];
      const label = document.createElement("span");
      label.className = "chart-legend-label";
      label.textContent = status.label;
      const value = document.createElement("strong");
      value.className = "chart-legend-value";
      value.textContent = String(count);
      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(value);
      legend.appendChild(row);
    });

    content.appendChild(svg);
    content.appendChild(legend);
    return buildChartCard(
      "Status mix",
      data.total > 0 ? "How the community's reports are progressing" : "No reports yet",
      content
    );
  }

  function buildCategoryChart(data) {
    const content = document.createElement("div");
    content.className = "bar-chart";
    if (data.categories.length === 0) {
      content.appendChild(buildChartEmpty("No category data yet."));
    } else {
      const maxVotes = Math.max.apply(null, data.categories.map(function (category) {
        return category.votes;
      }).concat([1]));
      data.categories.forEach(function (category) {
        const row = document.createElement("div");
        row.className = "bar-row";
        const head = document.createElement("div");
        head.className = "bar-row-head";
        const label = document.createElement("span");
        label.className = "bar-label";
        label.textContent = category.name;
        const value = document.createElement("span");
        value.className = "bar-value";
        value.textContent = category.votes + (category.votes === 1 ? " vote · " : " votes · ") +
          category.reports + (category.reports === 1 ? " report" : " reports");
        head.appendChild(label);
        head.appendChild(value);
        const track = document.createElement("div");
        track.className = "bar-track";
        const fill = document.createElement("span");
        fill.className = "bar-fill";
        fill.style.width = Math.round((category.votes / maxVotes) * 100) + "%";
        fill.style.backgroundColor = category.color;
        track.appendChild(fill);
        row.appendChild(head);
        row.appendChild(track);
        content.appendChild(row);
      });
    }
    return buildChartCard("Support by category", "Community votes attached to each issue type", content);
  }

  function buildTrendChart(data) {
    const content = document.createElement("div");
    content.className = "trend-chart";
    const max = Math.max.apply(null, data.days.map(function (day) {
      return day.count;
    }).concat([1]));
    data.days.forEach(function (day) {
      const column = document.createElement("div");
      column.className = "trend-column";
      column.title = day.count + (day.count === 1 ? " report" : " reports") +
        " on " + day.date.toLocaleDateString();

      const count = document.createElement("span");
      count.className = "trend-count";
      count.textContent = String(day.count);

      const track = document.createElement("div");
      track.className = "trend-track";
      const fill = document.createElement("span");
      fill.className = "trend-fill";
      fill.style.height = (day.count > 0 ? Math.max(7, Math.round((day.count / max) * 100)) : 0) + "%";
      track.appendChild(fill);

      const label = document.createElement("span");
      label.className = "trend-day";
      label.textContent = day.label;

      column.appendChild(count);
      column.appendChild(track);
      column.appendChild(label);
      content.appendChild(column);
    });
    return buildChartCard("New reports", data.lastSevenDays + " in the last 7 days", content);
  }

  function buildContributorChart(data) {
    const content = document.createElement("div");
    content.className = "mini-ranking";
    const leaders = data.overview.leaderboard.slice(0, 5);
    if (leaders.length === 0) {
      content.appendChild(buildChartEmpty("No ranked contributors yet."));
    } else {
      leaders.forEach(function (profile, index) {
        const row = document.createElement("div");
        row.className = "mini-ranking-row";
        const rank = document.createElement("span");
        rank.className = "mini-ranking-rank";
        rank.textContent = String(index + 1);
        const main = document.createElement("span");
        main.className = "mini-ranking-main";
        const name = document.createElement("strong");
        name.textContent = profile.name;
        const meta = document.createElement("span");
        meta.textContent = profile.level.name + " · " +
          pluralLabel(profile.unlockedBadges, "badge", "badges");
        main.appendChild(name);
        main.appendChild(meta);
        const points = document.createElement("span");
        points.className = "mini-ranking-points";
        points.textContent = formatPoints(profile.points);
        row.appendChild(rank);
        row.appendChild(main);
        row.appendChild(points);
        content.appendChild(row);
      });
    }
    return buildChartCard("Top contributors", "Points earned from reports, support, and fixes", content);
  }

  function renderAdminModal() {
    renderAdminStats();
    const sorted = getPriorityFeatures();
    const items = sorted.map(function (feature, index) {
      return buildAdminItem(feature, index);
    });
    els.adminList.replaceChildren.apply(els.adminList, items);
    els.adminList.hidden = sorted.length === 0;
    els.adminEmpty.hidden = sorted.length > 0;
    refreshIcons();
  }

  function renderAdminStats() {
    const total = state.features.length;
    const votes = state.features.reduce(function (sum, feature) {
      return sum + normalizeVotes(feature.votes);
    }, 0);
    const pending = state.features.filter(function (feature) {
      return feature.status === "pending";
    }).length;
    const resolved = state.features.filter(function (feature) {
      return feature.status === "resolved";
    }).length;
    const cards = [
      buildAdminStat("Total reports", total, ""),
      buildAdminStat("Awaiting review", pending, "is-pending"),
      buildAdminStat("Community votes", votes, "is-votes"),
      buildAdminStat("Resolved", resolved, "is-resolved")
    ];
    els.adminStats.replaceChildren.apply(els.adminStats, cards);
  }

  function buildAdminStat(label, value, tone) {
    const card = document.createElement("div");
    card.className = "admin-stat" + (tone ? " " + tone : "");

    const number = document.createElement("strong");
    number.className = "admin-stat-value";
    number.textContent = String(value);

    const text = document.createElement("span");
    text.className = "admin-stat-label";
    text.textContent = label;

    card.appendChild(number);
    card.appendChild(text);
    return card;
  }

  function getPriorityFeatures() {
    function group(feature) {
      if (feature.status === "pending") {
        return 0;
      }
      if (feature.status === "rejected") {
        return 2;
      }
      return 1;
    }
    return state.features.slice().sort(function (a, b) {
      const groupDifference = group(a) - group(b);
      if (groupDifference !== 0) {
        return groupDifference;
      }
      const difference = normalizeVotes(b.votes) - normalizeVotes(a.votes);
      if (difference !== 0) {
        return difference;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function buildAdminItem(feature, index) {
    const item = document.createElement("li");
    item.className = "admin-item";
    item.dataset.id = feature.id;

    const rank = document.createElement("span");
    rank.className = "admin-rank";
    rank.textContent = String(index + 1);
    rank.setAttribute("aria-label", "Priority " + (index + 1));

    const main = document.createElement("div");
    main.className = "admin-item-main";

    const titleRow = document.createElement("div");
    titleRow.className = "admin-item-title";

    const name = document.createElement("strong");
    name.className = "admin-item-name";
    name.textContent = feature.name;

    titleRow.appendChild(name);
    titleRow.appendChild(buildStatusPill(feature.status));

    const votes = normalizeVotes(feature.votes);
    const meta = document.createElement("div");
    meta.className = "admin-item-meta";
    meta.textContent = C.getCategory(feature.category).name +
      " · " + votes + (votes === 1 ? " vote" : " votes") +
      " · " + formatAge(feature.createdAt) +
      " · by " + (feature.createdByName || "Unattributed");

    const notes = document.createElement("p");
    notes.className = "admin-item-notes";
    notes.textContent = feature.notes || "No notes added.";

    main.appendChild(titleRow);
    main.appendChild(meta);
    main.appendChild(notes);

    const actions = document.createElement("div");
    actions.className = "admin-item-actions";

    if (feature.status === "pending") {
      actions.appendChild(buildAdminReviewActions(feature, item, {
        approve: true,
        reject: true
      }));
    } else if (feature.status === "rejected") {
      actions.appendChild(buildAdminReviewActions(feature, item, {
        approve: true,
        reject: false
      }));
    } else {
      actions.appendChild(buildAdminStatusControl(feature, item));
      actions.appendChild(buildAdminReviewActions(feature, item, {
        approve: false,
        reject: true
      }));
    }

    const locate = document.createElement("button");
    locate.type = "button";
    locate.className = "admin-locate-btn";
    locate.setAttribute("aria-label", "Show " + feature.name + " on the map");

    const locateIcon = document.createElement("i");
    locateIcon.setAttribute("data-lucide", "locate-fixed");
    locateIcon.setAttribute("aria-hidden", "true");

    const locateText = document.createElement("span");
    locateText.textContent = "Show on map";

    locate.appendChild(locateIcon);
    locate.appendChild(locateText);
    locate.addEventListener("click", function () {
      closeAdminModal();
      focusFeature(feature.id);
    });

    actions.appendChild(locate);
    item.appendChild(rank);
    item.appendChild(main);
    item.appendChild(actions);
    return item;
  }

  function buildAdminStatusControl(feature, item) {
    const statusControl = document.createElement("label");
    statusControl.className = "admin-status-control";

    const statusLabel = document.createElement("span");
    statusLabel.className = "admin-status-label";
    statusLabel.textContent = "Status";

    const select = document.createElement("select");
    select.className = "status-select";
    select.setAttribute("aria-label", "Status for " + feature.name);
    STATUSES.forEach(function (status) {
      const option = document.createElement("option");
      option.value = status.id;
      option.textContent = status.label;
      select.appendChild(option);
    });
    select.value = normalizeStatus(feature.status);
    select.addEventListener("change", function () {
      updateFeatureStatus(feature.id, select.value, item);
    });
    statusControl.appendChild(statusLabel);
    statusControl.appendChild(select);
    return statusControl;
  }

  function buildAdminReviewActions(feature, item, options) {
    const settings = options || {};
    const wrap = document.createElement("div");
    wrap.className = "admin-review-actions";

    if (settings.approve) {
      wrap.appendChild(buildAdminActionButton(
        feature.status === "rejected" ? "Approve report" : "Approve",
        "admin-approve-btn",
        "check",
        function () {
          updateFeatureStatus(feature.id, "open", item, MESSAGES.reportApproved);
        }
      ));
    }
    if (settings.reject) {
      wrap.appendChild(buildAdminActionButton(
        "Reject",
        "admin-reject-btn",
        "x",
        function () {
          updateFeatureStatus(feature.id, "rejected", item, MESSAGES.reportRejected);
        }
      ));
    }
    return wrap;
  }

  function buildAdminActionButton(label, className, iconName, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-action-btn " + className;

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", iconName);
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;

    button.appendChild(icon);
    button.appendChild(text);
    button.addEventListener("click", handler);
    return button;
  }

  function updateFeatureStatus(id, nextStatus, item, message) {
    const feature = state.features.find(function (entry) {
      return entry.id === id;
    });
    const status = STATUS_MAP[nextStatus];
    if (!feature || !status) {
      return;
    }

    feature.status = status.id;
    syncMapFeatures();
    renderFeatureList();
    updateExportAvailability();
    persistFeatures();

    if (!els.adminModal.hidden) {
      renderAdminModal();
      const row = Array.from(els.adminList.querySelectorAll(".admin-item")).find(function (entry) {
        return entry.dataset.id === id;
      });
      const nextFocus = row
        ? row.querySelector(".status-select, .admin-approve-btn, .admin-reject-btn, .admin-locate-btn")
        : null;
      (nextFocus || els.adminClose).focus();
    }

    showToast(message || (MESSAGES.statusUpdated + " · " + status.label));
  }

  function handleAdminModalKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAdminModal();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(els.adminModal.querySelectorAll(
      'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

  function loadSampleFeatures() {
    if (state.features.length > 0) {
      return;
    }

    const anchor = C.MapView.getAnchorLatLng();
    const lat = anchor.lat;
    const lng = anchor.lng;
    const now = Date.now();

    const samples = [
      {
        name: "Broken road",
        category: "Hazard",
        notes: "Pothole and broken asphalt near the crossing.",
        geometry: {
          type: "Point",
          coordinates: [lng - 0.0016, lat + 0.0011]
        },
        votes: 12,
        status: "open"
      },
      {
        name: "Community park",
        category: "Park",
        notes: "Shaded green space used by students after school.",
        votes: 7,
        status: "in_progress",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lng + 0.0010, lat - 0.0017],
            [lng + 0.0027, lat - 0.0017],
            [lng + 0.0027, lat - 0.0005],
            [lng + 0.0010, lat - 0.0005],
            [lng + 0.0010, lat - 0.0017]
          ]]
        }
      },
      {
        name: "Utility pole",
        category: "Utility",
        notes: "Streetlight pole with an exposed junction box.",
        geometry: {
          type: "Point",
          coordinates: [lng + 0.0004, lat + 0.0018]
        },
        votes: 4,
        status: "in_review"
      }
    ];

    const user = C.Auth && C.Auth.getCurrentUser ? C.Auth.getCurrentUser() : null;
    let added = 0;
    samples.forEach(function (sample, index) {
      const feature = {
        id: createId(),
        name: sample.name,
        category: sample.category,
        notes: sample.notes,
        position: {
          mode: "simulation",
          label: "Simulation",
          source: "simulation",
          accuracy: 5,
          mock: true,
          timestamp: new Date(now + index * 1000).toISOString()
        },
        createdAt: new Date(now + index * 1000).toISOString(),
        geometry: sample.geometry,
        votes: sample.votes,
        voterIds: [],
        comments: [],
        status: sample.status,
        createdBy: user ? user.id : "sample",
        createdByName: "Sample data",
        isSample: true
      };
      if (C.MapView.addFeature(feature)) {
        state.features.push(feature);
        added += 1;
      }
    });

    if (added === 0) {
      return;
    }

    renderFeatureList();
    updateExportAvailability();
    persistFeatures();
    showToast("Sample features added");
    if (isMobile()) {
      setSidebar(false);
    }
  }

  function persistFeatures() {
    window.clearTimeout(state.saveTimer);
    els.savePill.classList.remove("is-error");
    els.savePill.classList.add("is-saving");
    els.saveText.textContent = "Saving…";

    const result = C.Storage.save(state.features);

    if (!result.ok) {
      els.savePill.classList.remove("is-saving");
      els.savePill.classList.add("is-error");
      els.saveText.textContent = "Not saved";
      showToast(MESSAGES.storage, "warn");
      return;
    }

    state.saveTimer = window.setTimeout(function () {
      setSavedPill(result.savedAt);
    }, 430);
  }

  function setSavedPill(savedAt) {
    window.clearTimeout(state.saveTimer);
    els.savePill.classList.remove("is-saving");
    els.savePill.classList.remove("is-error");

    const date = savedAt ? new Date(savedAt) : null;
    if (date && !Number.isNaN(date.getTime())) {
      els.saveText.textContent = "✓ Saved " + formatTime(date);
    } else {
      els.saveText.textContent = "✓ Saved";
    }
  }

  function setSaveErrorPill() {
    window.clearTimeout(state.saveTimer);
    els.savePill.classList.remove("is-saving");
    els.savePill.classList.add("is-error");
    els.saveText.textContent = "Not saved";
  }

  function formatTime(date) {
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  }

  function updateExportAvailability() {
    const hasFeatures = getApprovedFeatures().length > 0;
    [els.exportGeoBtn, els.exportCsvBtn, els.headerExportGeo, els.headerExportCsv].forEach(function (button) {
      if (!button) {
        return;
      }
      button.setAttribute("aria-disabled", String(!hasFeatures));
      button.classList.toggle("is-disabled", !hasFeatures);
    });
  }

  function exportData(kind) {
    toggleExportMenu(false);
    const features = getApprovedFeatures();

    if (features.length === 0) {
      showToast(MESSAGES.empty);
      return;
    }

    if (kind === "geojson") {
      if (C.Export.exportGeoJSON(features)) {
        showToast(MESSAGES.geojson);
      }
      return;
    }

    if (kind === "csv") {
      if (C.Export.exportCsv(features)) {
        showToast(MESSAGES.csv);
      }
    }
  }

  function openVerification() {
    const features = getApprovedFeatures();
    if (features.length === 0) {
      showToast(MESSAGES.empty);
      return;
    }
    C.Export.openInGeoJsonIo(features);
  }

  function toggleExportMenu(forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean"
      ? forceOpen
      : els.exportMenu.hidden;

    els.exportMenu.hidden = !shouldOpen;
    els.headerExportBtn.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen) {
      const firstItem = els.exportMenu.querySelector("button");
      if (firstItem) {
        firstItem.focus();
      }
    }
  }

  function handleDocumentPointerDown(event) {
    if (!els.exportMenu.hidden && !event.target.closest(".export-wrap")) {
      toggleExportMenu(false);
    }
    if (!els.basemapMenu.hidden && !event.target.closest(".basemap-control")) {
      toggleBasemapMenu(false);
    }
  }

  function handleMenuKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      toggleExportMenu(false);
      els.headerExportBtn.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = Array.from(els.exportMenu.querySelectorAll("button"));
    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    }
    event.preventDefault();
    items[nextIndex].focus();
  }

  function handleGlobalKeydown(event) {
    if (
      event.target &&
      typeof event.target.closest === "function" &&
      event.target.closest("#mapSearch")
    ) {
      return;
    }
    if (
      event.target &&
      typeof event.target.closest === "function" &&
      event.target.closest(".auth-wrap")
    ) {
      return;
    }
    if (els.authModal && !els.authModal.hidden) {
      return;
    }
    if (els.adminModal && !els.adminModal.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdminModal();
      }
      return;
    }
    if (els.leaderboardModal && !els.leaderboardModal.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLeaderboard();
      }
      return;
    }

    if (els.photoViewer && !els.photoViewer.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePhotoViewer();
      }
      return;
    }

    if (els.reportDetailModal && !els.reportDetailModal.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReportDetail();
      }
      return;
    }

    if (event.key === "Escape") {
      if (!els.exportMenu.hidden) {
        event.preventDefault();
        toggleExportMenu(false);
        els.headerExportBtn.focus();
        return;
      }

      if (!els.basemapMenu.hidden) {
        event.preventDefault();
        toggleBasemapMenu(false);
        els.basemapToggle.focus();
        return;
      }

      if (!els.featureModal.hidden) {
        event.preventDefault();
        event.stopPropagation();
        cancelPendingFeature();
        return;
      }

      if (draw && draw.cancelActive()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isMobile() && els.sidebar.classList.contains("is-open")) {
        event.preventDefault();
        setSidebar(false);
        return;
      }
    }

    if (isTypingTarget(event.target)) {
      return;
    }
    if (els.featureModal && !els.featureModal.hidden) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "/") {
      event.preventDefault();
      if (C.Search && typeof C.Search.focus === "function") {
        C.Search.focus();
      }
      return;
    }

    const shortcuts = { p: "point", l: "line", a: "area" };
    if (shortcuts[key]) {
      event.preventDefault();
      activateTool(shortcuts[key]);
    }
  }

  function isTypingTarget(target) {
    if (!target) {
      return false;
    }
    const tagName = target.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      target.isContentEditable
    );
  }

  function setSidebar(open) {
    els.sidebar.classList.toggle("is-open", open);
    els.sidebarToggle.setAttribute("aria-expanded", String(open));
    els.sidebarToggle.setAttribute(
      "aria-label",
      open ? "Close mapping panel" : "Open mapping panel"
    );

    if (!open && isMobile() && els.sidebar.contains(document.activeElement)) {
      els.sidebarToggle.focus({ preventScroll: true });
    }
  }

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function handleResize() {
    if (!isMobile()) {
      setSidebar(false);
    }
  }

  function showTileBanner() {
    window.clearTimeout(state.tileBannerTimer);
    els.tileBanner.hidden = false;
    state.tileBannerTimer = window.setTimeout(function () {
      els.tileBanner.hidden = true;
    }, 8000);
  }

  function showToast(message, tone) {
    const toast = document.createElement("div");
    toast.className = "toast" + (tone === "warn" ? " is-warn" : "");

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", tone === "warn" ? "triangle-alert" : "check");
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    els.toastRegion.appendChild(toast);
    refreshIcons();

    window.setTimeout(function () {
      toast.classList.add("is-leaving");
      window.setTimeout(function () {
        toast.remove();
      }, 220);
    }, 3000);
  }

  function createId(prefix) {
    const base = typeof prefix === "string" && prefix ? prefix : "feature";
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return base + "-" + window.crypto.randomUUID();
    }
    return base + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
