import { randomUUID } from "node:crypto";

function currentDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function favoriteKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

function usefulKey(experienceId) {
  return `experience:${experienceId}:useful`;
}

function publicFavorite(favorite) {
  return {
    id: favorite.id,
    targetType: favorite.targetType,
    targetId: favorite.targetId,
    createdAt: favorite.createdAt
  };
}

function publicUsefulVote(vote) {
  return {
    id: vote.id,
    experienceId: vote.targetId,
    createdAt: vote.createdAt
  };
}

function publicReport(report) {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    description: report.description,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt
  };
}

export function createInteractionStore(options = {}) {
  const favoritesByUser = new Map();
  const usefulVotesByUser = new Map();
  const usefulVoteCountsByExperience = new Map();
  const reportsById = new Map();

  function favoriteMapFor(userId) {
    const existing = favoritesByUser.get(userId);

    if (existing) {
      return existing;
    }

    const nextMap = new Map();
    favoritesByUser.set(userId, nextMap);
    return nextMap;
  }

  function usefulVoteMapFor(userId) {
    const existing = usefulVotesByUser.get(userId);

    if (existing) {
      return existing;
    }

    const nextMap = new Map();
    usefulVotesByUser.set(userId, nextMap);
    return nextMap;
  }

  function listFavoritesFor({ userId, targetType } = {}) {
    const favorites = [...(favoritesByUser.get(userId)?.values() ?? [])]
      .filter((favorite) => !targetType || favorite.targetType === targetType)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return favorites.map(publicFavorite);
  }

  return {
    addFavorite({ userId, targetType, targetId }) {
      const favorites = favoriteMapFor(userId);
      const key = favoriteKey(targetType, targetId);
      const existing = favorites.get(key);

      if (existing) {
        return {
          favorite: publicFavorite(existing),
          created: false
        };
      }

      const favorite = {
        id: randomUUID(),
        userId,
        targetType,
        targetId,
        createdAt: currentDate(options.now).toISOString()
      };

      favorites.set(key, favorite);

      return {
        favorite: publicFavorite(favorite),
        created: true
      };
    },

    removeFavorite({ userId, favoriteId }) {
      const favorites = favoritesByUser.get(userId);

      if (!favorites) {
        return null;
      }

      for (const [key, favorite] of favorites) {
        if (favorite.id === favoriteId) {
          favorites.delete(key);
          return publicFavorite(favorite);
        }
      }

      return null;
    },

    listFavorites({ userId, targetType } = {}) {
      return listFavoritesFor({ userId, targetType });
    },

    listFavoriteSchoolIds(userId) {
      return listFavoritesFor({ userId, targetType: "school" })
        .map((favorite) => favorite.targetId);
    },

    markExperienceUseful({ userId, experienceId }) {
      const votes = usefulVoteMapFor(userId);
      const key = usefulKey(experienceId);
      const existing = votes.get(key);

      if (existing) {
        return {
          vote: publicUsefulVote(existing),
          created: false,
          voteCount: usefulVoteCountsByExperience.get(experienceId) ?? 0
        };
      }

      const vote = {
        id: randomUUID(),
        userId,
        targetType: "experience",
        targetId: experienceId,
        action: "useful",
        createdAt: currentDate(options.now).toISOString()
      };

      votes.set(key, vote);
      usefulVoteCountsByExperience.set(
        experienceId,
        (usefulVoteCountsByExperience.get(experienceId) ?? 0) + 1
      );

      return {
        vote: publicUsefulVote(vote),
        created: true,
        voteCount: usefulVoteCountsByExperience.get(experienceId) ?? 0
      };
    },

    usefulVoteCount(experienceId) {
      return usefulVoteCountsByExperience.get(experienceId) ?? 0;
    },

    createReport({ reporterId, targetType, targetId, reason, description }) {
      const createdAt = currentDate(options.now).toISOString();
      const report = {
        id: randomUUID(),
        reporterId,
        targetType,
        targetId,
        reason,
        description,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      };

      reportsById.set(report.id, report);
      return publicReport(report);
    },

    listReports({ reporterId, targetType, status } = {}) {
      return [...reportsById.values()]
        .filter((report) => !reporterId || report.reporterId === reporterId)
        .filter((report) => !targetType || report.targetType === targetType)
        .filter((report) => !status || report.status === status)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(publicReport);
    }
  };
}

export const interactionStore = createInteractionStore();
