interface Named {
  name: string;
  name_am: string;
}

/** The name in the chosen language. */
export const localName = (x: Named, lang: string) => (lang.startsWith("am") && x.name_am ? x.name_am : x.name);

/** The name in the other language, shown smaller under the main one so both can always be checked. */
export const otherName = (x: Named, lang: string) => (lang.startsWith("am") ? x.name : x.name_am);
export const otherLang = (lang: string) => (lang.startsWith("am") ? "en" : "am");
