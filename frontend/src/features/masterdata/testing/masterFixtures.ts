import type { Material, Product } from "../api";

/** Invented sample data. Known facts from Crown's report: LLDPE M500026, 25 kg bags, the 8 g jar cover. */
export const MATERIALS: Material[] = [
  { id: "m1", kind: "raw_material", name: "LLDPE M500026", name_am: "LLDPE M500026", unit: "kg", bag_qty: "25.000", active: true, used_in: 3 },
  { id: "m2", kind: "additive", name: "Grey masterbatch", name_am: "ግራጫ ማስተርባች", unit: "kg", bag_qty: "25.000", active: true, used_in: 1 },
  { id: "m3", kind: "additive", name: "Blue masterbatch", name_am: "ሰማያዊ ማስተርባች", unit: "kg", bag_qty: "25.000", active: true, used_in: 1 },
  { id: "m4", kind: "raw_material", name: "LLDPE M500040", name_am: "LLDPE M500040", unit: "kg", bag_qty: "25.000", active: true, used_in: 0 },
];

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Egg tray",
    name_am: "የእንቁላል ትሪ",
    sale_unit: "piece",
    package_qty: "30.000",
    weight_per_piece_g: null,
    active: true,
    colours: [{ id: "c1", product_id: "p1", name: "Grey", name_am: "ግራጫ", active: true, active_version: 3 }],
  },
  {
    id: "p2",
    name: "Jar cover",
    name_am: "የጀሪካን ክዳን",
    sale_unit: "kg",
    package_qty: "20.000",
    weight_per_piece_g: "8.000",
    active: true,
    colours: [
      { id: "c2", product_id: "p2", name: "Clear", name_am: "ግልጽ", active: true, active_version: 2 },
      { id: "c3", product_id: "p2", name: "Blue", name_am: "ሰማያዊ", active: true, active_version: null },
    ],
  },
];
