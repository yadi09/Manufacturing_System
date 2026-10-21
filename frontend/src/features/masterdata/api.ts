import { request } from "../../api/client";

export interface Material {
  id: string;
  kind: "raw_material" | "additive";
  name: string;
  name_am: string;
  unit: "kg" | "g";
  bag_qty: string | null;
  active: boolean;
  /** Recipes in use that contain this material. */
  used_in: number;
}

export interface MaterialInput {
  kind?: Material["kind"];
  name: string;
  name_am: string;
  unit?: Material["unit"];
  bag_qty: string | null;
  active?: boolean;
}

export interface Colour {
  id: string;
  product_id: string;
  name: string;
  name_am: string;
  active: boolean;
  /** null: no recipe yet. */
  active_version: number | null;
}

export interface Product {
  id: string;
  name: string;
  name_am: string;
  sale_unit: "piece" | "kg";
  package_qty: string;
  weight_per_piece_g: string | null;
  active: boolean;
  colours: Colour[];
}

export interface ProductInput {
  name: string;
  name_am: string;
  sale_unit: Product["sale_unit"];
  package_qty: string;
  weight_per_piece_g: string | null;
  active?: boolean;
}

export interface ColourInput {
  name: string;
  name_am: string;
  active?: boolean;
}

export const listMaterials = () => request<Material[]>("GET", "/api/materials");
export const createMaterial = (m: MaterialInput) => request<Material>("POST", "/api/materials", m);
export const updateMaterial = (id: string, m: MaterialInput) => request<Material>("PATCH", `/api/materials/${id}`, m);

export const listProducts = () => request<Product[]>("GET", "/api/products");
export const createProduct = (p: ProductInput) => request<Product>("POST", "/api/products", p);
export const updateProduct = (id: string, p: ProductInput) => request<Product>("PATCH", `/api/products/${id}`, p);
export const createColour = (productId: string, c: ColourInput) => request<Colour>("POST", `/api/products/${productId}/colours`, c);
export const updateColour = (id: string, c: ColourInput) => request<Colour>("PATCH", `/api/colours/${id}`, c);
