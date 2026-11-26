import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService, guestOnly, requirePerm } from './core/auth';

/** Screens of «Попутно» (ported from design2/site/js/views), guarded by the backend permissions. */
export const routes: Routes = [
  { path: 'login', canActivate: [guestOnly], loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  { path: '', pathMatch: 'full', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/summary/summary').then((m) => m.SummaryView) },
  { path: 'queue', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/queue/queue').then((m) => m.QueueView) },
  { path: 'objects', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/objects/objects').then((m) => m.ObjectsView) },
  { path: 'objects/:id', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/object/object').then((m) => m.ObjectView) },
  { path: 'orders', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/orders/orders').then((m) => m.OrdersView) },
  { path: 'orders/:id', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/order/order').then((m) => m.OrderView) },
  { path: 'quality', canActivate: [requirePerm('stats_read')], loadComponent: () => import('./views/quality/quality').then((m) => m.QualityView) },
  { path: 'import', canActivate: [requirePerm('frames_upload')], loadComponent: () => import('./views/import/import').then((m) => m.ImportView) },
  { path: 'check', canActivate: [requirePerm('frames_upload')], loadComponent: () => import('./views/check/check').then((m) => m.CheckView) },
  { path: 'about', canActivate: [requirePerm('objects_read')], loadComponent: () => import('./views/about/about').then((m) => m.AboutView) },
  { path: 'users', canActivate: [requirePerm('users_manage')], loadComponent: () => import('./pages/users/users').then((m) => m.UsersPage) },
  { path: '**', redirectTo: () => inject(AuthService).home() },
];
