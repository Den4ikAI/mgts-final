import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService, ROLE_LABEL, Role, User } from '../../core/auth';
import { PP, plural } from '../../ui/pp';
import { Shell } from '../../ui/shell.service';

/** Admin: create users, change role, disable. Changes end the user's sessions. */
@Component({
  selector: 'app-users',
  imports: [DatePipe, ...PP],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ux-page ux-page--wide">
      <header class="ux-pagehead">
        <div>
          <h2 class="pp-h2">Пользователи</h2>
          <p class="ux-pagehead__meta">Учётные записи диспетчеров, руководителей и бригад. Смена роли или отключение завершает сессии пользователя.</p>
        </div>
      </header>

      @if (error()) {
        <div class="ux-banner ux-banner--warn" role="alert"><pp-icon name="alert" cls="pp-icon--sm" /><span>{{ error() }}</span></div>
      }

      <p class="ux-count">{{ users().length }} {{ countWord() }} · активных {{ activeCount() }}</p>
      <div class="pp-table-wrap ux-tablewrap">
        <table class="pp-table ux-table">
          <thead>
            <tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Последний вход</th><th>Доступ</th><th class="pp-table__num"></th></tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr [class.us-off]="!u.active">
                <td class="pp-table__main"><span class="pp-id">{{ u.login }}</span>@if (u.id === me()) { <span class="pp-badge pp-badge--accent us-me">вы</span> }</td>
                <td class="pp-table__main">{{ u.display_name }}</td>
                <td>
                  <span class="pp-select us-select">
                    <select [disabled]="u.id === me()" [attr.aria-label]="'Роль ' + u.login" (change)="patch(u, { role: $any($event.target).value })">
                      @for (r of roles; track r) { <option [value]="r" [selected]="r === u.role">{{ label[r] }}</option> }
                    </select>
                    <svg class="pp-select__chevron" aria-hidden="true"><use href="/brand/icons.svg#i-chevron-down" /></svg>
                  </span>
                </td>
                <td class="pp-mono">{{ u.last_login_at ? (u.last_login_at | date: 'dd.MM HH:mm') : '—' }}</td>
                <td>
                  @if (u.active) { <span class="pp-badge pp-badge--accent">включён</span> } @else { <span class="pp-badge">отключён</span> }
                </td>
                <td class="pp-table__num">
                  @if (u.id !== me()) {
                    <button class="pp-btn pp-btn--sm" type="button" [class.pp-btn--ghost]="u.active" [class.pp-btn--secondary]="!u.active" (click)="patch(u, { active: !u.active })">{{ u.active ? 'Отключить' : 'Включить' }}</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="pp-muted">Загружаем пользователей…</td></tr>
            }
          </tbody>
        </table>
      </div>

      <section class="ux-panel">
        <header class="ux-panel__head"><h3 class="ux-panel__title">Новый пользователь</h3><span class="ux-panel__meta">пароль от 8 символов</span></header>
        <form class="us-new" (submit)="create($event, login.value, name.value, role.value, pw.value); login.value = ''; pw.value = ''">
          <label class="pp-field"><span class="pp-field__label">Логин</span><input class="pp-input pp-input--mono" #login placeholder="логин" autocomplete="off" required /></label>
          <label class="pp-field"><span class="pp-field__label">Имя</span><input class="pp-input" #name placeholder="Имя, как в нарядах" required /></label>
          <label class="pp-field"><span class="pp-field__label">Роль</span>
            <span class="pp-select">
              <select #role>@for (r of roles; track r) { <option [value]="r">{{ label[r] }}</option> }</select>
              <svg class="pp-select__chevron" aria-hidden="true"><use href="/brand/icons.svg#i-chevron-down" /></svg>
            </span>
          </label>
          <label class="pp-field"><span class="pp-field__label">Пароль</span><input class="pp-input" #pw type="password" placeholder="от 8 символов" autocomplete="new-password" required /></label>
          <button class="pp-btn pp-btn--primary"><pp-icon name="plus" />Создать</button>
        </form>
      </section>
    </div>
  `,
  styles: `
    .us-off td, .us-off .pp-id { color: var(--text-muted); }
    .us-me { margin-left: var(--space-2); }
    .us-select { width: 180px; }
    .us-select > select { height: var(--control-sm); }
    .us-new { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: var(--space-3); align-items: end; }
    @media (max-width: 900px) { .us-new { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class UsersPage {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly me = computed(() => this.auth.user()?.id);
  readonly roles: Role[] = ['dispatcher', 'manager', 'technician', 'admin'];
  readonly label = ROLE_LABEL;
  readonly users = signal<User[]>([]);
  readonly error = signal('');
  readonly activeCount = computed(() => this.users().filter((u) => u.active).length);
  readonly countWord = computed(() => plural(this.users().length, ['пользователь', 'пользователя', 'пользователей']));

  constructor() {
    inject(Shell).setTitle('Пользователи');
    this.reload();
  }

  reload() {
    this.http.get<User[]>('/api/users').subscribe((u) => this.users.set(u));
  }

  patch(u: User, body: Partial<Pick<User, 'role' | 'active' | 'display_name'>>) {
    this.error.set('');
    this.http.patch<User>(`/api/users/${u.id}`, body).subscribe({
      next: () => this.reload(),
      error: (e) => this.fail(e),
    });
  }

  create(e: Event, login: string, display_name: string, role: string, password: string) {
    e.preventDefault();
    this.error.set('');
    this.http.post<User>('/api/users', { login, display_name, role, password }).subscribe({
      next: () => this.reload(),
      error: (err) => this.fail(err),
    });
  }

  private fail(e: unknown) {
    this.error.set(e instanceof HttpErrorResponse ? (e.error?.error ?? e.message) : String(e));
    this.reload();
  }
}
