(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  const POINTS = {
    report: 10,
    voteReceived: 5,
    voteCast: 1,
    resolved: 15
  };

  const LEVELS = [
    { id: "newcomer", name: "Newcomer", min: 0, icon: "sprout", tone: "muted" },
    { id: "scout", name: "Neighborhood Scout", min: 30, icon: "compass", tone: "blue" },
    { id: "navigator", name: "Civic Navigator", min: 80, icon: "map", tone: "purple" },
    { id: "guardian", name: "Community Guardian", min: 160, icon: "shield-check", tone: "green" },
    { id: "legend", name: "Atlas Legend", min: 300, icon: "crown", tone: "amber" }
  ];

  const BADGES = [
    {
      id: "first-pin",
      name: "First Pin",
      description: "Add your first report",
      icon: "map-pin",
      metric: "reports",
      target: 1,
      tone: "blue"
    },
    {
      id: "street-scholar",
      name: "Street Scholar",
      description: "Add 5 reports",
      icon: "book-open",
      metric: "reports",
      target: 5,
      tone: "purple"
    },
    {
      id: "map-maker",
      name: "Map Maker",
      description: "Add 10 reports",
      icon: "map",
      metric: "reports",
      target: 10,
      tone: "blue"
    },
    {
      id: "crowd-favorite",
      name: "Crowd Favorite",
      description: "Receive 10 votes",
      icon: "thumbs-up",
      metric: "votesReceived",
      target: 10,
      tone: "amber"
    },
    {
      id: "peoples-champion",
      name: "People's Champion",
      description: "Receive 25 votes",
      icon: "award",
      metric: "votesReceived",
      target: 25,
      tone: "amber"
    },
    {
      id: "community-backer",
      name: "Community Backer",
      description: "Support 10 reports",
      icon: "heart-handshake",
      metric: "votesCast",
      target: 10,
      tone: "green"
    },
    {
      id: "problem-solver",
      name: "Problem Solver",
      description: "Get a report resolved",
      icon: "badge-check",
      metric: "resolved",
      target: 1,
      tone: "green"
    },
    {
      id: "atlas-legend",
      name: "Atlas Legend",
      description: "Reach the top rank",
      icon: "crown",
      metric: "level",
      target: LEVELS.length,
      tone: "amber"
    }
  ];

  const METRIC_LABELS = {
    reports: "reports",
    votesReceived: "votes received",
    votesCast: "votes cast",
    resolved: "resolved",
    level: "rank"
  };

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

  function isSampleFeature(feature) {
    return Boolean(feature && (
      feature.isSample === true ||
      feature.createdBy === "sample" ||
      feature.createdByName === "Sample data"
    ));
  }

  function isApprovedFeature(feature) {
    return Boolean(feature && feature.status !== "pending" && feature.status !== "rejected");
  }

  function levelForPoints(points) {
    let levelIndex = 0;
    LEVELS.forEach(function (level, index) {
      if (points >= level.min) {
        levelIndex = index;
      }
    });
    return levelIndex;
  }

  function createProfile(user) {
    return {
      id: user.id,
      name: user.name || "Community reporter",
      role: user.role === "admin" ? "admin" : "reporter",
      reports: 0,
      votesReceived: 0,
      votesCast: 0,
      resolved: 0,
      points: 0,
      level: LEVELS[0],
      levelIndex: 0,
      nextLevel: LEVELS[1] || null,
      progress: 0,
      pointsToNext: LEVELS[1] ? LEVELS[1].min : 0,
      badges: [],
      unlockedBadges: 0,
      rank: null
    };
  }

  function buildBadgeStates(profile) {
    const values = {
      reports: profile.reports,
      votesReceived: profile.votesReceived,
      votesCast: profile.votesCast,
      resolved: profile.resolved,
      level: profile.levelIndex + 1
    };
    return BADGES.map(function (badge) {
      const value = values[badge.metric] || 0;
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        tone: badge.tone,
        value: value,
        target: badge.target,
        metric: badge.metric,
        metricLabel: METRIC_LABELS[badge.metric],
        unlocked: value >= badge.target
      };
    });
  }

  function finalizeProfile(profile) {
    profile.points = profile.reports * POINTS.report +
      profile.votesReceived * POINTS.voteReceived +
      profile.votesCast * POINTS.voteCast +
      profile.resolved * POINTS.resolved;

    const levelIndex = levelForPoints(profile.points);
    const level = LEVELS[levelIndex];
    const nextLevel = LEVELS[levelIndex + 1] || null;
    const span = nextLevel ? nextLevel.min - level.min : 1;
    const progress = nextLevel
      ? Math.max(0, Math.min(1, (profile.points - level.min) / span))
      : 1;

    profile.level = level;
    profile.levelIndex = levelIndex;
    profile.nextLevel = nextLevel;
    profile.progress = progress;
    profile.pointsToNext = nextLevel ? Math.max(0, nextLevel.min - profile.points) : 0;
    profile.badges = buildBadgeStates(profile);
    profile.unlockedBadges = profile.badges.filter(function (badge) {
      return badge.unlocked;
    }).length;
    return profile;
  }

  function compareProfiles(left, right) {
    if (right.points !== left.points) {
      return right.points - left.points;
    }
    if (right.votesReceived !== left.votesReceived) {
      return right.votesReceived - left.votesReceived;
    }
    if (right.reports !== left.reports) {
      return right.reports - left.reports;
    }
    if (right.votesCast !== left.votesCast) {
      return right.votesCast - left.votesCast;
    }
    return left.name.localeCompare(right.name);
  }

  function summarize(features, users) {
    const allFeatures = Array.isArray(features) ? features : [];
    const allUsers = Array.isArray(users) ? users : [];
    const profiles = new Map();
    const adminIds = new Set(allUsers.filter(function (user) {
      return user && user.role === "admin" && typeof user.id === "string";
    }).map(function (user) {
      return user.id;
    }));
    const realFeatures = allFeatures.filter(function (feature) {
      return !isSampleFeature(feature) &&
        isApprovedFeature(feature) &&
        !adminIds.has(feature.createdBy);
    });

    allUsers.forEach(function (user) {
      if (user && typeof user.id === "string" && user.id && !adminIds.has(user.id)) {
        profiles.set(user.id, createProfile(user));
      }
    });

    realFeatures.forEach(function (feature) {
      let profile = profiles.get(feature.createdBy);
      if (!profile && feature.createdBy && feature.createdBy !== "sample") {
        profile = createProfile({
          id: feature.createdBy,
          name: feature.createdByName || "Former reporter",
          role: "reporter"
        });
        profiles.set(feature.createdBy, profile);
      }
      if (!profile) {
        return;
      }
      profile.reports += 1;
      if (feature.status === "resolved") {
        profile.resolved += 1;
      }
      profile.votesReceived += Math.max(
        normalizeVotes(feature.votes),
        normalizeVoterIds(feature.voterIds).length
      );
    });

    realFeatures.forEach(function (feature) {
      normalizeVoterIds(feature.voterIds).forEach(function (userId) {
        const profile = profiles.get(userId);
        if (profile) {
          profile.votesCast += 1;
        }
      });
    });

    const allProfiles = Array.from(profiles.values()).map(finalizeProfile);
    allProfiles.sort(compareProfiles);

    const leaderboard = allProfiles.filter(function (profile) {
      return profile.points > 0 || profile.reports > 0 || profile.votesCast > 0;
    });
    leaderboard.forEach(function (profile, index) {
      profile.rank = index + 1;
    });

    return {
      profiles: allProfiles,
      leaderboard: leaderboard,
      totals: {
        reports: realFeatures.length,
        contributors: leaderboard.length,
        votesReceived: leaderboard.reduce(function (sum, profile) {
          return sum + profile.votesReceived;
        }, 0),
        badges: leaderboard.reduce(function (sum, profile) {
          return sum + profile.unlockedBadges;
        }, 0)
      }
    };
  }

  function getProfile(overview, userId) {
    if (!overview || !Array.isArray(overview.profiles) || !userId) {
      return null;
    }
    return overview.profiles.find(function (profile) {
      return profile.id === userId;
    }) || null;
  }

  C.Contributors = {
    POINTS: POINTS,
    LEVELS: LEVELS,
    BADGES: BADGES,
    isSampleFeature: isSampleFeature,
    isApprovedFeature: isApprovedFeature,
    summarize: summarize,
    getProfile: getProfile
  };
})();
