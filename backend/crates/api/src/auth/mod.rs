//! Authentication and role-based access.
//!
//! * Access token: short-lived HS256 JWT (default 15 min), sent as
//!   `Authorization: Bearer …`. Stateless: the API does not hit the DB to check it.
//! * Refresh token: opaque random 256-bit value (default 30 days), kept in an
//!   HttpOnly cookie scoped to `/api/auth`. Only its SHA-256 is stored. Every
//!   refresh rotates it; replaying a rotated token revokes the whole session.
//! * Stream ticket: 60-second JWT for `GET /api/stream?ticket=…`, because
//!   `EventSource` cannot send headers and the access token must not end up in URLs/logs.
//!
//! Handlers declare what they need with the [`AuthUser`] extractor and
//! `user.require(Perm::…)?`; the role → permission matrix lives in [`Role::can`].

pub mod password;
pub mod routes;
pub mod tokens;

use std::time::Duration;

use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header, request::Parts},
};
use chrono::Utc;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::ApiError, AppState};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    /// Manages users, sees everything, dev tools.
    Admin,
    /// Works the review queue, opens work orders.
    Dispatcher,
    /// Read-only: map, objects, dashboard.
    Manager,
    /// Field crew: sees objects and own work orders, closes them.
    Technician,
}

impl Role {
    pub const ALL: [Role; 4] = [Role::Admin, Role::Dispatcher, Role::Manager, Role::Technician];

    pub fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Dispatcher => "dispatcher",
            Role::Manager => "manager",
            Role::Technician => "technician",
        }
    }

    pub fn parse(s: &str) -> Option<Role> {
        Role::ALL.into_iter().find(|r| r.as_str() == s)
    }

    /// The single place that decides who may do what.
    pub fn can(self, p: Perm) -> bool {
        use Perm::*;
        use Role::*;
        match (self, p) {
            (Admin, _) => true,
            (_, ObjectsRead) => true,
            (Dispatcher, Review | StatsRead | WorkOrdersManage | FramesUpload) => true,
            (Manager, StatsRead) => true,
            (Technician, WorkOrdersOwn | FramesUpload) => true,
            _ => false,
        }
    }

    pub fn permissions(self) -> Vec<Perm> {
        Perm::ALL.into_iter().filter(|p| self.can(*p)).collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Perm {
    /// Objects, history, review queue (read), live stream.
    ObjectsRead,
    /// Confirm / reject / request recapture.
    Review,
    /// Dashboard aggregates.
    StatsRead,
    /// Create and assign work orders.
    WorkOrdersManage,
    /// See and close work orders assigned to me.
    WorkOrdersOwn,
    /// Create users, change roles, deactivate.
    UsersManage,
    /// `/api/dev/*` synthetic data.
    DevTools,
    /// Upload photos for analysis (`POST /api/frames`).
    FramesUpload,
}

impl Perm {
    pub const ALL: [Perm; 8] = [
        Perm::ObjectsRead,
        Perm::Review,
        Perm::StatsRead,
        Perm::WorkOrdersManage,
        Perm::WorkOrdersOwn,
        Perm::UsersManage,
        Perm::DevTools,
        Perm::FramesUpload,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenKind {
    Access,
    Stream,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub login: String,
    pub name: String,
    pub role: Role,
    pub typ: TokenKind,
    pub iat: i64,
    pub exp: i64,
    pub jti: Uuid,
}

pub struct AuthConfig {
    enc: EncodingKey,
    dec: DecodingKey,
    pub access_ttl: Duration,
    pub refresh_ttl: Duration,
    pub stream_ttl: Duration,
    pub cookie_secure: bool,
    /// Verified against when the login does not exist, so response time does
    /// not reveal which logins are registered.
    pub dummy_hash: String,
}

impl AuthConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let secret = match std::env::var("JWT_SECRET").ok().filter(|s| !s.is_empty()) {
            Some(s) if s.len() >= 32 => s.into_bytes(),
            Some(_) => anyhow::bail!("JWT_SECRET must be at least 32 bytes"),
            None => {
                tracing::warn!(
                    "JWT_SECRET not set: using a random one, tokens die on restart"
                );
                tokens::random_bytes(48)
            }
        };
        let secs = |key: &str, default: u64| -> anyhow::Result<Duration> {
            Ok(Duration::from_secs(match std::env::var(key) {
                Ok(v) => v.parse()?,
                Err(_) => default,
            }))
        };
        Ok(Self {
            enc: EncodingKey::from_secret(&secret),
            dec: DecodingKey::from_secret(&secret),
            access_ttl: secs("ACCESS_TTL_SECS", 15 * 60)?,
            refresh_ttl: secs("REFRESH_TTL_SECS", 30 * 24 * 3600)?,
            stream_ttl: Duration::from_secs(60),
            cookie_secure: std::env::var("COOKIE_SECURE").is_ok_and(|v| v == "1"),
            dummy_hash: password::hash("not-a-real-password")?,
        })
    }

    pub fn issue(&self, user: &UserIdentity, typ: TokenKind) -> anyhow::Result<(String, Duration)> {
        let ttl = match typ {
            TokenKind::Access => self.access_ttl,
            TokenKind::Stream => self.stream_ttl,
        };
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: user.id,
            login: user.login.clone(),
            name: user.display_name.clone(),
            role: user.role,
            typ,
            iat: now,
            exp: now + ttl.as_secs() as i64,
            jti: Uuid::now_v7(),
        };
        let token = jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &self.enc)?;
        Ok((token, ttl))
    }

    pub fn verify(&self, token: &str, typ: TokenKind) -> Result<Claims, ApiError> {
        let mut v = Validation::new(Algorithm::HS256);
        v.leeway = 5;
        let data = jsonwebtoken::decode::<Claims>(token, &self.dec, &v)
            .map_err(|_| ApiError::unauthorized("invalid or expired token"))?;
        if data.claims.typ != typ {
            return Err(ApiError::unauthorized("wrong token type"));
        }
        Ok(data.claims)
    }
}

/// What goes into a token. Built from a `users` row.
#[derive(Debug, Clone)]
pub struct UserIdentity {
    pub id: Uuid,
    pub login: String,
    pub display_name: String,
    pub role: Role,
}

/// Extractor: the caller, authenticated by a valid access token.
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl AuthUser {
    pub fn require(&self, p: Perm) -> Result<(), ApiError> {
        if self.0.role.can(p) {
            Ok(())
        } else {
            Err(ApiError::forbidden())
        }
    }
    pub fn id(&self) -> Uuid {
        self.0.sub
    }
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| ApiError::unauthorized("missing bearer token"))?;
        state.auth.verify(token.trim(), TokenKind::Access).map(AuthUser)
    }
}

/// Creates users on startup:
/// * `ADMIN_PASSWORD` (+ optional `ADMIN_LOGIN`, default `admin`) → an admin, if the table is empty;
/// * `SEED_DEMO_USERS=1` → one user per role (`DEMO_PASSWORD`, default `mgts-demo`). Local demo only.
pub async fn bootstrap(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users").fetch_one(db).await?;

    if count == 0 {
        // compose passes an empty string when it is not set: treat that as "not set"
        if let Some(pw) = std::env::var("ADMIN_PASSWORD").ok().filter(|p| !p.is_empty()) {
            let login = std::env::var("ADMIN_LOGIN").unwrap_or_else(|_| "admin".into());
            routes::insert_user(db, &login, "Администратор", Role::Admin, &pw)
                .await
                .map_err(ApiError::into_anyhow)?;
            tracing::info!("bootstrap admin '{login}' created");
        }
    }

    if std::env::var("SEED_DEMO_USERS").is_ok_and(|v| v == "1") {
        let pw = std::env::var("DEMO_PASSWORD").unwrap_or_else(|_| "mgts-demo".into());
        let demo = [
            ("admin", "Администратор", Role::Admin),
            ("dispatcher", "Диспетчер Иванова", Role::Dispatcher),
            ("manager", "Руководитель Петров", Role::Manager),
            ("tech", "Бригада 3 · Сидоров", Role::Technician),
        ];
        for (login, name, role) in demo {
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE login = $1)")
                    .bind(login)
                    .fetch_one(db)
                    .await?;
            if !exists {
                routes::insert_user(db, login, name, role, &pw)
                    .await
                    .map_err(ApiError::into_anyhow)?;
            }
        }
        tracing::warn!("SEED_DEMO_USERS=1: demo users present, do not use in production");
    }

    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users").fetch_one(db).await?;
    if count == 0 {
        tracing::warn!("no users: set ADMIN_PASSWORD (or SEED_DEMO_USERS=1) and restart");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_matrix() {
        assert!(Role::Admin.can(Perm::UsersManage));
        assert!(Role::Dispatcher.can(Perm::Review));
        assert!(!Role::Dispatcher.can(Perm::UsersManage));
        assert!(!Role::Manager.can(Perm::Review));
        assert!(Role::Manager.can(Perm::StatsRead));
        assert!(!Role::Technician.can(Perm::StatsRead));
        assert!(Role::Technician.can(Perm::WorkOrdersOwn));
        for r in Role::ALL {
            assert!(r.can(Perm::ObjectsRead));
            assert_eq!(Role::parse(r.as_str()), Some(r));
        }
    }

    fn cfg() -> AuthConfig {
        let secret = b"0123456789abcdef0123456789abcdef";
        AuthConfig {
            enc: EncodingKey::from_secret(secret),
            dec: DecodingKey::from_secret(secret),
            access_ttl: Duration::from_secs(60),
            refresh_ttl: Duration::from_secs(3600),
            stream_ttl: Duration::from_secs(60),
            cookie_secure: false,
            dummy_hash: String::new(),
        }
    }

    fn who() -> UserIdentity {
        UserIdentity {
            id: Uuid::now_v7(),
            login: "d".into(),
            display_name: "D".into(),
            role: Role::Dispatcher,
        }
    }

    #[test]
    fn jwt_roundtrip_and_type_check() {
        let c = cfg();
        let (t, _) = c.issue(&who(), TokenKind::Access).unwrap();
        assert_eq!(c.verify(&t, TokenKind::Access).ok().unwrap().role, Role::Dispatcher);
        assert!(c.verify(&t, TokenKind::Stream).is_err(), "access token is not a stream ticket");
        assert!(c.verify(&format!("{t}x"), TokenKind::Access).is_err(), "tampered");
    }

    #[test]
    fn jwt_expired() {
        let mut c = cfg();
        c.access_ttl = Duration::ZERO;
        let (t, _) = c.issue(&who(), TokenKind::Access).unwrap();
        // exp == iat; leeway is 5 s, so forge an older token instead of sleeping.
        let mut claims = c.verify(&t, TokenKind::Access).ok().unwrap();
        claims.exp -= 60;
        let old = jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &c.enc).unwrap();
        assert!(c.verify(&old, TokenKind::Access).is_err());
    }
}
