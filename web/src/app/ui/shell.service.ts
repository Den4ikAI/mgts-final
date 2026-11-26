import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  title: string;
  text?: string;
  tone?: '' | 'ok' | 'critical' | 'warn';
  /** Router link for the action button. */
  link?: string;
  actionLabel?: string;
  leaving?: boolean;
}

/** Page title, toasts and the help dialog: what the shell shows on behalf of the screens. */
@Injectable({ providedIn: 'root' })
export class Shell {
  readonly title = signal('');
  readonly toasts = signal<Toast[]>([]);
  readonly helpOpen = signal(false);
  private seq = 0;

  /** Screens call this on init: header title + document.title. */
  setTitle(t: string) {
    this.title.set(t);
    document.title = `${t} · Попутно`;
  }

  toast(t: Omit<Toast, 'id'>, life = 4500) {
    const id = ++this.seq;
    this.toasts.update((xs) => [...xs, { ...t, id }].slice(-3));
    setTimeout(() => this.close(id), life);
  }

  close(id: number) {
    this.toasts.update((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => this.toasts.update((xs) => xs.filter((x) => x.id !== id)), 220);
  }
}
