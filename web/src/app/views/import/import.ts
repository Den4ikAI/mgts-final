import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/import.js */
@Component({
  selector: 'app-import-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Загрузить данные» переносится.</p></div>`,
})
export class ImportView {
  constructor() {
    inject(Shell).setTitle('Загрузить данные');
  }
}
