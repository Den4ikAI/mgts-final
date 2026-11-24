import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ObjectStatus = 'ok' | 'suspected' | 'defect' | 'not_observed';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type ReviewDecision = 'confirm' | 'reject' | 'need_recapture';

export interface InfraObject {
  id: string;
  kind: 'cable_well' | 'dual_pole';
  lat: number | null;
  lon: number | null;
  address: string | null;
  status: ObjectStatus;
  last_defect_type: string | null;
  max_severity: Severity | null;
  last_seen_at: string | null;
  updated_at: string;
}

export interface Detection {
  id: string;
  frame_id: string;
  object_id: string | null;
  object_kind: InfraObject['kind'];
  defect_type: string | null;
  severity: Severity | null;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  crop_uri: string | null;
  rationale: string | null;
  lat: number | null;
  lon: number | null;
  review_state: 'pending' | 'confirm' | 'reject' | 'need_recapture' | 'confirmed';
  created_at: string;
}

export interface ObjectEventRow {
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
  source: string;
  occurred_at: string;
}

/** All calls go through the dev-server proxy (proxy.conf.json) to the Rust API. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  objects(filter: { status?: ObjectStatus; kind?: string } = {}) {
    return this.http.get<InfraObject[]>('/api/objects', { params: filter as Record<string, string> });
  }
  object(id: string) {
    return this.http.get<{ object: InfraObject; detections: Detection[] }>(`/api/objects/${id}`);
  }
  history(id: string) {
    return this.http.get<ObjectEventRow[]>(`/api/objects/${id}/history`);
  }
  queue() {
    return this.http.get<Detection[]>('/api/queue');
  }
  stats() {
    return this.http.get<{ status: ObjectStatus; count: number }[]>('/api/stats');
  }
  review(objectId: string, body: { detection_id?: string; decision: ReviewDecision; reject_reason?: string; reviewer: string; comment?: string }) {
    return this.http.post(`/api/objects/${objectId}/reviews`, body);
  }

  /** Live object events (SSE). */
  live(): Observable<{ key: string; payload: { type: string } & Record<string, unknown> }> {
    return new Observable((sub) => {
      const es = new EventSource('/api/stream');
      es.onmessage = (m) => sub.next(JSON.parse(m.data));
      es.onerror = () => {}; // EventSource reconnects by itself
      return () => es.close();
    });
  }
}

export const STATUS_LABEL: Record<ObjectStatus, string> = {
  ok: 'Норма',
  suspected: 'Проверить',
  defect: 'Дефект',
  not_observed: 'Не наблюдается',
};
