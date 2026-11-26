import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, ROLE_LABEL, Role } from '../../core/auth';
import { PP } from '../../ui/pp';

const DEMO_PASSWORD = 'mgts-demo';
const DEMO_USERS: { login: string; role: Role; name: string; icon: string }[] = [
  { login: 'admin', role: 'admin', name: 'Администратор', icon: 'layers' },
  { login: 'dispatcher', role: 'dispatcher', name: 'Диспетчер Иванова', icon: 'user-check' },
  { login: 'manager', role: 'manager', name: 'Руководитель Петров', icon: 'chart' },
  { login: 'tech', role: 'technician', name: 'Бригада 3 · Сидоров', icon: 'route' },
];

/** Sign-in in the «Попутно» brand; rendered without the shell. The first input must stay «Логин» (e2e-shot.cjs). */
@Component({
  selector: 'app-login',
  imports: [...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="lg">
      <section class="lg__card" aria-labelledby="lg-title">
        <div class="ux-logo lg__logo"><pp-mark cls="pp-mark-anim" [size]="40" /><span class="ux-logo__word">попутно</span></div>
        <header class="lg__head">
          <h1 class="pp-h2" id="lg-title">Вход</h1>
          <p class="lg__sub">Мониторинг ТКШ и РЩ МГТС по фото с машин, которые уже едут.</p>
        </header>
        <form class="lg__form" (submit)="submit($event, login.value, password.value)">
          <label class="pp-field">
            <span class="pp-field__label">Логин</span>
            <input class="pp-input" #login name="login" autocomplete="username" required autofocus />
          </label>
          <label class="pp-field">
            <span class="pp-field__label">Пароль</span>
            <input class="pp-input" #password name="password" type="password" autocomplete="current-password" required />
          </label>
          @if (error()) {
            <p class="lg__err" role="alert"><pp-icon name="alert" cls="pp-icon--sm" />{{ error() }}</p>
          }
          <button class="pp-btn pp-btn--primary pp-btn--lg pp-btn--block" [disabled]="busy()">
            {{ busy() ? 'Входим…' : 'Войти' }}
          </button>
        </form>
        <section class="lg__demo" aria-labelledby="lg-demo">
          <div class="lg__demo-head">
            <h2 class="pp-label" id="lg-demo">Демо-входы</h2>
            <span class="pp-caption pp-muted">пароль <span class="pp-mono">{{ demoPassword }}</span></span>
          </div>
          <div class="lg__demo-grid">
            @for (d of demo; track d.login) {
              <button class="pp-btn pp-btn--secondary lg__demo-btn" type="button" [disabled]="busy()" (click)="demoLogin(d.login)">
                <pp-icon [name]="d.icon" cls="pp-icon--sm" />
                <span class="lg__demo-text">
                  <span class="lg__demo-role">{{ roleLabel[d.role] }}</span>
                  <span class="lg__demo-name">{{ d.name }}</span>
                </span>
              </button>
            }
          </div>
        </section>
      </section>
      <p class="lg__foot pp-caption pp-muted">Кейс МГТС · Код города</p>
    </main>
  `,
  styles: `
    :host { display: block; }
    .lg { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: var(--space-4); padding: var(--space-6) var(--space-4); background: var(--surface-base); color: var(--text-primary); }
    .lg__card { width: min(440px, 100%); display: flex; flex-direction: column; gap: var(--space-5);
                padding: var(--space-6); background: var(--surface-raised); border-radius: var(--radius-xl); box-shadow: var(--shadow-float); }
    .lg__logo { height: 40px; }
    .lg__logo .ux-logo__word { font-size: 1.5rem; }
    .lg__head { display: flex; flex-direction: column; gap: var(--space-1); }
    .lg__sub { color: var(--text-secondary); font-size: var(--text-body-sm-size); }
    .lg__form { display: flex; flex-direction: column; gap: var(--space-4); }
    .lg__form .pp-input { height: var(--target-min, 44px); font-size: var(--text-body-size); }
    .lg__err { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--text-danger); font-size: var(--text-body-sm-size); }
    .lg__demo { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-4); box-shadow: inset 0 1px 0 var(--border-subtle); }
    .lg__demo-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); color: var(--text-secondary); }
    .lg__demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
    .lg__demo-btn { height: auto; min-height: 52px; padding: var(--space-2) var(--space-3); justify-content: flex-start; text-align: left; gap: var(--space-2); }
    .lg__demo-btn .pp-icon { flex: none; color: var(--accent-fg); }
    .lg__demo-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
    .lg__demo-role { font-size: var(--text-micro-size); letter-spacing: var(--text-micro-tr); text-transform: uppercase; color: var(--text-muted); font-weight: var(--weight-semibold); }
    .lg__demo-name { font-size: var(--text-body-sm-size); color: var(--text-primary); white-space: normal; line-height: 1.25; }
    @media (max-width: 420px) { .lg__card { padding: var(--space-5); } .lg__demo-grid { grid-template-columns: 1fr; } }
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly demo = DEMO_USERS;
  readonly demoPassword = DEMO_PASSWORD;
  readonly roleLabel = ROLE_LABEL;

  constructor() {
    document.title = 'Вход · Попутно';
  }

  submit(e: Event, login: string, password: string) {
    e.preventDefault();
    return this.signIn(login, password, true);
  }

  /** One-click demo sign-in: lands on the role's home screen. */
  demoLogin(login: string) {
    return this.signIn(login, DEMO_PASSWORD, false);
  }

  private async signIn(login: string, password: string, honourNext: boolean) {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(login, password);
      const next = honourNext ? this.route.snapshot.queryParamMap.get('next') : null;
      this.router.navigateByUrl(next && next !== '/login' ? next : this.auth.home());
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.error.set(
        status === 401 ? 'Неверный логин или пароль'
        : status === 403 ? 'Учётная запись отключена'
        : 'Сервер недоступен, попробуйте ещё раз',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
