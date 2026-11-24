import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Api, InfraObject, STATUS_LABEL, pillVariant } from '../../core/api';

/** Object registry with statuses. The map view goes here once the design is ready. */
@Component({
  selector: 'app-objects',
  imports: [DatePipe],
  template: `
    <h1>Объекты</h1>
    <table>
      <tr><th>ID</th><th>Тип</th><th>Статус</th><th>Дефект</th><th>Последний проезд</th></tr>
      @for (o of objects(); track o.id) {
        <tr>
          <td>{{ o.id }}</td>
          <td>{{ o.kind === 'cable_well' ? 'Колодец' : 'Опора' }}</td>
          <td><span class="mg-pill" [class]="'mg-pill mg-pill--' + pill(o.status)">{{ label[o.status] }}</span></td>
          <td>{{ o.last_defect_type ?? '—' }}</td>
          <td>{{ o.last_seen_at | date: 'dd.MM HH:mm' }}</td>
        </tr>
      }
    </table>
  `,
  styles: `
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); }
  `,
})
export class ObjectsPage {
  readonly label = STATUS_LABEL;
  readonly pill = pillVariant;
  readonly objects = signal<InfraObject[]>([]);
  constructor() {
    inject(Api).objects().subscribe((o) => this.objects.set(o));
  }
}
