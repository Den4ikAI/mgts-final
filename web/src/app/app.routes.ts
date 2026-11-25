import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, guestOnly, requirePerm } from './core/auth';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).home() },
  { path: 'login', canActivate: [guestOnly], loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  { path: 'queue', canActivate: [requirePerm('review')], loadComponent: () => import('./pages/queue/queue').then((m) => m.QueuePage) },
  { path: 'objects', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./pages/objects/objects').then((m) => m.ObjectsPage) },
  { path: 'dashboard', canActivate: [requirePerm('stats_read')], loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
  { path: 'quality', canActivate: [requirePerm('stats_read')], loadComponent: () => import('./pages/quality/quality').then((m) => m.QualityPage) },
  { path: 'users', canActivate: [requirePerm('users_manage')], loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage) },
  { path: '**', redirectTo: '' },
];
