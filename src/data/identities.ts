export type IdentityAlignment = "light" | "night" | "balanced";

export type IdentityId =
  | "sun-walker"
  | "ember-saint"
  | "dawnkeeper"
  | "flame-herald"
  | "night-walker"
  | "dream-shepherd"
  | "moon-herald"
  | "keeper-of-echoes"
  | "twilight-pilgrim"
  | "wheelkeeper"
  | "threshold-walker"
  | "warden-of-the-turning";

export interface IdentityDef {
  title: string;
  alignment: IdentityAlignment;
  tier: 1 | 2 | 3 | 4;
  image: string;
}

export const IDENTITIES: Record<IdentityId, IdentityDef> = {
  "sun-walker": { title: "Sun-Walker", alignment: "light", tier: 1, image: "/archetypes/sun-walker.png" },
  "ember-saint": { title: "Ember Saint", alignment: "light", tier: 2, image: "/archetypes/ember-saint.png" },
  "dawnkeeper": { title: "Dawnkeeper", alignment: "light", tier: 3, image: "/archetypes/dawnkeeper.png" },
  "flame-herald": { title: "Flame Herald", alignment: "light", tier: 4, image: "/archetypes/flame-herald.png" },
  "night-walker": { title: "Night-Walker", alignment: "night", tier: 1, image: "/archetypes/night-walker.png" },
  "dream-shepherd": { title: "Dream Shepherd", alignment: "night", tier: 2, image: "/archetypes/dream-shepherd.png" },
  "moon-herald": { title: "Moon Herald", alignment: "night", tier: 3, image: "/archetypes/moon-herald.png" },
  "keeper-of-echoes": { title: "Keeper of Echoes", alignment: "night", tier: 4, image: "/archetypes/keeper-of-echoes.png" },
  "twilight-pilgrim": { title: "Twilight Pilgrim", alignment: "balanced", tier: 1, image: "/archetypes/twilight-pilgrim.png" },
  "wheelkeeper": { title: "Wheelkeeper", alignment: "balanced", tier: 2, image: "/archetypes/wheelkeeper.png" },
  "threshold-walker": { title: "Threshold Walker", alignment: "balanced", tier: 3, image: "/archetypes/threshold-walker.png" },
  "warden-of-the-turning": { title: "Warden of the Turning", alignment: "balanced", tier: 4, image: "/archetypes/warden-of-the-turning.png" },
};

const BY_ALIGNMENT_TIER: Record<IdentityAlignment, IdentityId[]> = {
  light: ["sun-walker", "ember-saint", "dawnkeeper", "flame-herald"],
  night: ["night-walker", "dream-shepherd", "moon-herald", "keeper-of-echoes"],
  balanced: ["twilight-pilgrim", "wheelkeeper", "threshold-walker", "warden-of-the-turning"],
};

export function identityForAlignmentTier(alignment: IdentityAlignment, tier: number): IdentityId {
  const ids = BY_ALIGNMENT_TIER[alignment];
  const idx = Math.max(0, Math.min(3, tier - 1));
  return ids[idx];
}

export function identityTitle(id: IdentityId): string {
  return IDENTITIES[id].title;
}

export function identityIcon(id: IdentityId): string {
  return `/archetypes/icons/${id}.png`;
}

export function identityAlignmentLabel(alignment: IdentityAlignment): string {
  if (alignment === "light") return "light-aligned";
  if (alignment === "night") return "night-aligned";
  return "balanced";
}
