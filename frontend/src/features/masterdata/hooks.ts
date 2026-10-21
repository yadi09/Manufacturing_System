import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColour,
  createMaterial,
  createProduct,
  listMaterials,
  listProducts,
  updateColour,
  updateMaterial,
  updateProduct,
  type ColourInput,
  type MaterialInput,
  type ProductInput,
} from "./api";

export const MATERIALS = ["materials"];
export const PRODUCTS = ["products"];

export const useMaterials = () => useQuery({ queryKey: MATERIALS, queryFn: listMaterials, retry: false });
export const useProducts = () => useQuery({ queryKey: PRODUCTS, queryFn: listProducts, retry: false });

function useInvalidating<TVars, TData>(fn: (v: TVars) => Promise<TData>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))) });
}

export const useCreateMaterial = () => useInvalidating((m: MaterialInput) => createMaterial(m), [MATERIALS]);
export const useUpdateMaterial = () => useInvalidating(({ id, ...m }: { id: string } & MaterialInput) => updateMaterial(id, m), [MATERIALS]);
export const useCreateProduct = () => useInvalidating((p: ProductInput) => createProduct(p), [PRODUCTS]);
export const useUpdateProduct = () => useInvalidating(({ id, ...p }: { id: string } & ProductInput) => updateProduct(id, p), [PRODUCTS]);
// Colours change what the products list shows, and a new colour adds an item to nothing the UI lists, so only products refresh.
export const useCreateColour = () => useInvalidating(({ productId, ...c }: { productId: string } & ColourInput) => createColour(productId, c), [PRODUCTS]);
export const useUpdateColour = () => useInvalidating(({ id, ...c }: { id: string } & ColourInput) => updateColour(id, c), [PRODUCTS, MATERIALS]);
