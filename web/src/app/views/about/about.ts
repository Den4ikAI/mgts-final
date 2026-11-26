import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/about.js */
@Component({
  selector: 'app-about-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «О системе» переносится.</p></div>`,
})
export class AboutView {
  constructor() {
    inject(Shell).setTitle('О системе');
  }
}
