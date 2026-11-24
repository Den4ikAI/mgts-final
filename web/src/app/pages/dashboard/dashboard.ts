import { Component, inject, signal } from '@angular/core';
import { Api, ObjectStatus, STATUS_LABEL } from '../../core/api';

@Component({
  selector: 'app-dashboard',
  template: `
    <h1>Сводка</h1>
    <div class="tiles">
      @for (s of stats(); track s.status) {
        <div class="tile"><span class="status" [attr.data-status]="s.status">{{ label[s.status] }}</span><b>{{ s.count }}</b></div>
      }
    </div>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .tile { padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); display: grid; gap: 8px; }
    b { font-size: 32px; }
  `,
})
export class DashboardPage {
  readonly label = STATUS_LABEL;
  readonly stats = signal<{ status: ObjectStatus; count: number }[]>([]);
  constructor() {
    inject(Api).stats().subscribe((s) => this.stats.set(s));
  }
}
