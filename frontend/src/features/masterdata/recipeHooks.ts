import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { PRODUCTS } from "./hooks";
import { getRecipe, getRecipeVersion, listRecipeVersions, saveRecipe, type NewRecipe, type Recipe } from "./recipeApi";

const recipeKey = (colourId: string) => ["recipe", colourId];

/** The version in use, or null when the colour has no recipe yet. */
export function useRecipe(colourId: string | undefined) {
  return useQuery({
    queryKey: recipeKey(colourId ?? ""),
    enabled: Boolean(colourId),
    retry: false,
    queryFn: async (): Promise<Recipe | null> => {
      try {
        return await getRecipe(colourId!);
      } catch (e) {
        if (e instanceof ApiError && e.code === "no_recipe") return null;
        throw e;
      }
    },
  });
}

export const useRecipeVersions = (colourId: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...recipeKey(colourId ?? ""), "versions"], enabled: Boolean(colourId) && enabled, retry: false, queryFn: () => listRecipeVersions(colourId!) });

export const useRecipeVersion = (colourId: string | undefined, version: number | null) =>
  useQuery({ queryKey: [...recipeKey(colourId ?? ""), "version", version], enabled: Boolean(colourId) && version !== null, retry: false, queryFn: () => getRecipeVersion(colourId!, version!) });

export function useSaveRecipe(colourId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: NewRecipe) => saveRecipe(colourId, r),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: recipeKey(colourId) }), qc.invalidateQueries({ queryKey: PRODUCTS })]),
  });
}
