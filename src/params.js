import { defineParams } from '@sveltejs/kit/params';
import { OVERLAYS } from '#lib/overlays.js';

export const params = defineParams({
  /** @param {string} param */
  overlay: (param) => {
    const overlay = OVERLAYS.find((o) => o === param);
    return overlay;
  },
});
