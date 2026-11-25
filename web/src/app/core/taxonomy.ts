import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

interface Taxonomy {
  classes: Record<string, { label: string; kind: string | null; ok: boolean }>;
}

/** Class keys → Russian labels, from ml/taxonomy.json via /api/taxonomy (single source of truth). */
@Injectable({ providedIn: 'root' })
export class TaxonomyService {
  private data = toSignal(
    inject(HttpClient).get<Taxonomy>('/api/taxonomy').pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  readonly classes = computed(() => this.data()?.classes ?? {});
  label(key: string | null | undefined): string {
    if (!key) return 'Норма';
    return this.classes()[key]?.label ?? key;
  }
}

export const SEVERITY_LABEL: Record<string, string> = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
  critical: 'Угроза жизни',
};
