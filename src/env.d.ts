/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "*.mp3" {
  const src: string;
  export default src;
}
