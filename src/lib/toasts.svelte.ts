interface Toast {
  id: number;
  message: string;
}

let _nextId = 0;

export const toasts = $state<Toast[]>([]);

export function showToast(message: string, duration = 6000) {
  const id = _nextId++;
  toasts.push({ id, message });
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number) {
  const i = toasts.findIndex(t => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}
