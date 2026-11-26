import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/quality.js */
@Component({
  selector: 'app-quality-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Качество модели» переносится.</p></div>`,
})
export class QualityView {
  constructor() {
    inject(Shell).setTitle('Качество модели');
  }
}
