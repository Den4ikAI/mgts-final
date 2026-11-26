//! OpenAPI 3.1 schema generated from the handlers (utoipa) and Swagger UI.
//!
//! * `GET /api/openapi.json` — the schema
//! * `GET /api/docs` — Swagger UI (vendored, works offline). Log in with
//!   `POST /api/auth/login`, paste `access_token` into «Authorize».

use axum::Router;
use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};
use utoipa_swagger_ui::{Config, SwaggerUi};

use crate::{auth, files, frames, routes, AppState};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "МГТС · мониторинг инфраструктуры",
        description = "API прототипа: реестр объектов (ТКШ, РЩ), очередь разбора срабатываний модели, \
                       история объектов из Kafka, отчёт о качестве модели, пользователи и роли.\n\n\
                       **Как попробовать:** `POST /api/auth/login` (демо: `dispatcher` / `mgts-demo`), \
                       скопировать `access_token` и нажать **Authorize**.",
        version = env!("CARGO_PKG_VERSION"),
    ),
    paths(
        routes::health,
        auth::routes::login, auth::routes::refresh, auth::routes::logout, auth::routes::logout_all,
        auth::routes::me, auth::routes::stream_ticket, auth::routes::roles,
        auth::routes::list_users, auth::routes::create_user, auth::routes::update_user,
        routes::list_objects, routes::get_object, routes::object_history, routes::stream,
        routes::review_queue, routes::post_review,
        routes::stats, files::quality, files::taxonomy,
        files::media,
        frames::upload, frames::list_frames, frames::get_frame,
        routes::dev_inject_detection,
    ),
    modifiers(&BearerAuth),
    tags(
        (name = "auth", description = "Вход, обновление токена, выход. Access JWT 15 мин + ротируемый refresh в HttpOnly-cookie"),
        (name = "users", description = "Управление пользователями (admin)"),
        (name = "objects", description = "Реестр объектов, история, live-поток"),
        (name = "review", description = "Очередь разбора и решения диспетчера"),
        (name = "stats", description = "Статистика, качество модели, таксономия"),
        (name = "frames", description = "Загрузка фото на анализ: файл в S3, событие в Kafka, вердикт модели за 1–3 с"),
        (name = "files", description = "Фото: загруженные (S3) и из датасета"),
        (name = "dev", description = "Только для демо: синтетическое срабатывание"),
        (name = "system"),
    )
)]
pub struct ApiDoc;

struct BearerAuth;

impl Modify for BearerAuth {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "bearer",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .description(Some("access_token из POST /api/auth/login"))
                    .build(),
            ),
        );
    }
}

pub fn router() -> Router<AppState> {
    SwaggerUi::new("/api/docs")
        .url("/api/openapi.json", ApiDoc::openapi())
        .config(Config::default().persist_authorization(true).try_it_out_enabled(true))
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every route in the routers is documented and vice versa.
    #[test]
    fn schema_builds_and_covers_routes() {
        let doc = ApiDoc::openapi();
        let paths: Vec<_> = doc.paths.paths.keys().cloned().collect();
        for p in [
            "/health", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/logout-all",
            "/api/auth/me", "/api/auth/stream-ticket", "/api/auth/roles", "/api/users", "/api/users/{id}",
            "/api/objects", "/api/objects/{id}", "/api/objects/{id}/history", "/api/objects/{id}/reviews",
            "/api/queue", "/api/stats", "/api/stream", "/api/dev/detections",
            "/api/media/{path}", "/api/quality", "/api/taxonomy", "/api/frames", "/api/frames/{id}",
        ] {
            assert!(paths.iter().any(|x| x == p), "{p} missing from OpenAPI; have {paths:?}");
        }
        assert_eq!(paths.len(), 23, "{paths:?}");
        serde_json::to_string(&doc).unwrap();
    }
}
