import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/summary.js */
@Component({
  selector: 'app-summary-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Сводка» переносится.</p></div>`,
})
export class SummaryView {
  constructor() {
    inject(Shell).setTitle('Сводка');
  }
}
