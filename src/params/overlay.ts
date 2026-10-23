import type { ParamMatcher } from '@sveltejs/kit';
import { OVERLAYS, type Overlay } from '$lib/ui.svelte';

export const match = ((param: string): param is Overlay =>
  (OVERLAYS as readonly string[]).includes(param)) satisfies ParamMatcher;
