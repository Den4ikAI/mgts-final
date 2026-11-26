import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/queue.js */
@Component({
  selector: 'app-queue-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Очередь проверки» переносится.</p></div>`,
})
export class QueueView {
  constructor() {
    inject(Shell).setTitle('Очередь проверки');
  }
}
