import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/check.js */
@Component({
  selector: 'app-check-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Проверить фото» переносится.</p></div>`,
})
export class CheckView {
  constructor() {
    inject(Shell).setTitle('Проверить фото');
  }
}
