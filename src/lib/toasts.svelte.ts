interface Toast {
  id: number;
  message: string;
  type: 'info' | 'error';
  persistent: boolean;
}

let _nextId = 0;

export const toasts = $state<Toast[]>([]);

export function showToast(
  message: string,
  options?: { duration?: number; type?: 'info' | 'error'; persistent?: boolean }
) {
  const type = options?.type ?? 'error';
  const persistent = options?.persistent ?? false;
  const duration = options?.duration ?? (persistent ? 0 : 6000);
  const id = _nextId++;
  toasts.push({ id, message, type, persistent });
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number) {
  const i = toasts.findIndex(t => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}
