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

function publicFavorite(favorite) {
  return {
    id: favorite.id,
    targetType: favorite.targetType,
    targetId: favorite.targetId,
    createdAt: favorite.createdAt
  };
}

export function createInteractionStore(options = {}) {
  const favoritesByUser = new Map();

  function favoriteMapFor(userId) {
    const existing = favoritesByUser.get(userId);

    if (existing) {
      return existing;
    }

    const nextMap = new Map();
    favoritesByUser.set(userId, nextMap);
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
    }
  };
}

export const interactionStore = createInteractionStore();
