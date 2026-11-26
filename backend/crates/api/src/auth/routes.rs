use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::{password, tokens, AuthUser, Perm, Role, TokenKind, UserIdentity};
use crate::{
    error::{ApiError, ApiResult, ErrorBody},
    AppState,
};

const COOKIE: &str = "mgts_refresh";
const COOKIE_PATH: &str = "/api/auth";
/// A token rotated less than this long ago is a concurrent refresh from another
/// tab, not a replay: answer 401 but keep the session alive.
const ROTATION_GRACE_SECS: i64 = 30;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/refresh", post(refresh))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/logout-all", post(logout_all))
        .route("/api/auth/me", get(me))
        .route("/api/auth/stream-ticket", post(stream_ticket))
        .route("/api/auth/roles", get(roles))
        .route("/api/users", get(list_users).post(create_user))
        .route("/api/users/{id}", patch(update_user))
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
pub struct UserRow {
    id: Uuid,
    login: String,
    display_name: String,
    #[schema(value_type = Role)]
    role: String,
    active: bool,
    created_at: DateTime<Utc>,
    last_login_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, ToSchema)]
struct UserView {
    #[serde(flatten)]
    user: UserRow,
    permissions: Vec<Perm>,
}

impl From<UserRow> for UserView {
    fn from(user: UserRow) -> Self {
        let permissions = Role::parse(&user.role).map(Role::permissions).unwrap_or_default();
        Self { user, permissions }
    }
}

#[derive(Serialize, ToSchema)]
struct TokenResponse {
    /// JWT для заголовка `Authorization: Bearer …`
    access_token: String,
    #[schema(value_type = String, example = "Bearer")]
    token_type: &'static str,
    /// Seconds until the access token expires.
    expires_in: u64,
    user: UserView,
}

#[derive(sqlx::FromRow)]
struct AuthRow {
    id: Uuid,
    login: String,
    display_name: String,
    role: String,
    active: bool,
    password_hash: String,
}

impl AuthRow {
    fn identity(&self) -> Result<UserIdentity, ApiError> {
        Ok(UserIdentity {
            id: self.id,
            login: self.login.clone(),
            display_name: self.display_name.clone(),
            role: Role::parse(&self.role)
                .ok_or_else(|| anyhow::anyhow!("unknown role {}", self.role))?,
        })
    }
}

pub async fn insert_user(
    db: &sqlx::PgPool,
    login: &str,
    display_name: &str,
    role: Role,
    pw: &str,
) -> Result<UserRow, ApiError> {
    let login = normalize_login(login)?;
    if pw.chars().count() < password::MIN_LEN {
        return Err(ApiError::bad_request(format!(
            "password must be at least {} characters",
            password::MIN_LEN
        )));
    }
    let hash = password::hash_blocking(pw.to_string()).await?;
    let row = sqlx::query_as::<_, UserRow>(
        "INSERT INTO users (id, login, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (login) DO NOTHING
         RETURNING id, login, display_name, role, active, created_at, last_login_at",
    )
    .bind(Uuid::now_v7())
    .bind(&login)
    .bind(display_name.trim())
    .bind(role.as_str())
    .bind(hash)
    .fetch_optional(db)
    .await?;
    row.ok_or_else(|| ApiError::conflict(format!("login '{login}' already exists")))
}

fn normalize_login(login: &str) -> Result<String, ApiError> {
    let l = login.trim().to_lowercase();
    let ok = (2..=64).contains(&l.len())
        && l.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    if ok {
        Ok(l)
    } else {
        Err(ApiError::bad_request("login: 2–64 chars, a-z 0-9 . _ -"))
    }
}

fn refresh_cookie(s: &AppState, value: String) -> Cookie<'static> {
    Cookie::build((COOKIE, value))
        .path(COOKIE_PATH)
        .http_only(true)
        .secure(s.auth.cookie_secure)
        .same_site(SameSite::Strict)
        .max_age(cookie::time::Duration::seconds(s.auth.refresh_ttl.as_secs() as i64))
        .build()
}

fn clear_cookie(jar: CookieJar) -> CookieJar {
    jar.remove(Cookie::build(COOKIE).path(COOKIE_PATH))
}

/// Refresh token from the cookie (browser) or the JSON body (scripts, tests).
fn presented_token(jar: &CookieJar, body: Option<RefreshBody>) -> Option<String> {
    body.and_then(|b| b.refresh_token)
        .or_else(|| jar.get(COOKIE).map(|c| c.value().to_string()))
}

fn user_agent(h: &HeaderMap) -> Option<String> {
    h.get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.chars().take(200).collect())
}

/// Inserts a refresh token row and returns the plaintext token.
async fn store_refresh(
    tx: &mut sqlx::PgConnection,
    s: &AppState,
    user_id: Uuid,
    family_id: Uuid,
    ua: Option<String>,
) -> Result<(Uuid, String), ApiError> {
    let (token, hash) = tokens::new_refresh();
    let id = Uuid::now_v7();
    let expires = Utc::now() + chrono::Duration::from_std(s.auth.refresh_ttl)?;
    sqlx::query(
        "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(user_id)
    .bind(family_id)
    .bind(hash)
    .bind(expires)
    .bind(ua)
    .execute(&mut *tx)
    .await?;
    Ok((id, token))
}

async fn user_view(db: &sqlx::PgPool, id: Uuid) -> Result<UserView, ApiError> {
    let row = sqlx::query_as::<_, UserRow>(
        "SELECT id, login, display_name, role, active, created_at, last_login_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| ApiError::not_found("user not found"))?;
    Ok(row.into())
}

async fn token_response(
    s: &AppState,
    who: &UserIdentity,
) -> Result<TokenResponse, ApiError> {
    let (access_token, ttl) = s.auth.issue(who, TokenKind::Access)?;
    Ok(TokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: ttl.as_secs(),
        user: user_view(&s.db, who.id).await?,
    })
}

#[derive(Deserialize, ToSchema)]
struct LoginBody {
    #[schema(example = "dispatcher")]
    login: String,
    #[schema(example = "mgts-demo")]
    password: String,
}

/// Вход по логину и паролю. Отдаёт access token (15 мин) и ставит HttpOnly-cookie
/// `mgts_refresh` для `/api/auth/refresh`.
#[utoipa::path(post, path = "/api/auth/login", tag = "auth", request_body = LoginBody,
    responses((status = 200, body = TokenResponse), (status = 401, description = "Неверный логин или пароль", body = ErrorBody)))]
async fn login(
    State(s): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    Json(b): Json<LoginBody>,
) -> Result<(CookieJar, Json<TokenResponse>), ApiError> {
    let row = sqlx::query_as::<_, AuthRow>(
        "SELECT id, login, display_name, role, active, password_hash FROM users WHERE login = $1",
    )
    .bind(b.login.trim().to_lowercase())
    .fetch_optional(&s.db)
    .await?;

    let phc = row
        .as_ref()
        .map(|r| r.password_hash.clone())
        .unwrap_or_else(|| s.auth.dummy_hash.clone());
    let ok = password::verify_blocking(b.password, phc).await;
    let row = match row {
        Some(r) if ok => r,
        _ => {
            tracing::info!(login = %b.login, "login failed");
            return Err(ApiError::unauthorized("invalid login or password"));
        }
    };
    if !row.active {
        return Err(ApiError::Status(StatusCode::FORBIDDEN, "account disabled".into()));
    }
    let who = row.identity()?;

    let mut tx = s.db.begin().await?;
    let (_, refresh) = store_refresh(&mut tx, &s, who.id, Uuid::now_v7(), user_agent(&headers)).await?;
    sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1")
        .bind(who.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    tracing::info!(login = %who.login, role = who.role.as_str(), "login");
    Ok((jar.add(refresh_cookie(&s, refresh)), Json(token_response(&s, &who).await?)))
}

#[derive(Deserialize, Default, ToSchema)]
struct RefreshBody {
    /// Для скриптов; браузер шлёт cookie `mgts_refresh`
    refresh_token: Option<String>,
}

#[derive(sqlx::FromRow)]
struct RefreshRow {
    #[sqlx(rename = "token_id")]
    id: Uuid,
    family_id: Uuid,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    #[sqlx(flatten)]
    user: AuthRow,
}

async fn revoke_family(db: impl sqlx::PgExecutor<'_>, family: Uuid) -> Result<(), ApiError> {
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL")
        .bind(family)
        .execute(db)
        .await?;
    Ok(())
}

/// Rotates the refresh token and returns a fresh access token.
/// The body is optional: browsers rely on the cookie.
#[utoipa::path(post, summary = "Новый access token по refresh (cookie или тело); refresh ротируется", path = "/api/auth/refresh", tag = "auth", request_body(content = Option<RefreshBody>),
    responses((status = 200, body = TokenResponse), (status = 401, body = ErrorBody)))]
async fn refresh(
    State(s): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    body: Option<Json<RefreshBody>>,
) -> Result<(CookieJar, Json<TokenResponse>), (CookieJar, ApiError)> {
    let token = presented_token(&jar, body.map(|b| b.0));
    let Some(token) = token else {
        return Err((jar, ApiError::unauthorized("no refresh token")));
    };
    match rotate(&s, &headers, &token).await {
        Ok((who, new_token)) => {
            let res = token_response(&s, &who).await.map_err(|e| (jar.clone(), e))?;
            Ok((jar.add(refresh_cookie(&s, new_token)), Json(res)))
        }
        Err(Rotation::Grace) => Err((jar, ApiError::unauthorized("refresh token already rotated, retry"))),
        Err(Rotation::Fail(e)) => Err((clear_cookie(jar), e)),
    }
}

enum Rotation {
    /// Concurrent refresh: leave the cookie alone, client retries with the new one.
    Grace,
    Fail(ApiError),
}

impl<E: Into<ApiError>> From<E> for Rotation {
    fn from(e: E) -> Self {
        Rotation::Fail(e.into())
    }
}

async fn rotate(
    s: &AppState,
    headers: &HeaderMap,
    token: &str,
) -> Result<(UserIdentity, String), Rotation> {
    let mut tx = s.db.begin().await.map_err(ApiError::from)?;
    let row = sqlx::query_as::<_, RefreshRow>(
        "SELECT t.id AS token_id, t.family_id, t.expires_at, t.revoked_at,
                u.id, u.login, u.display_name, u.role, u.active, u.password_hash
         FROM refresh_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1
         FOR UPDATE OF t",
    )
    .bind(tokens::hash(token))
    .fetch_optional(&mut *tx)
    .await
    .map_err(ApiError::from)?
    .ok_or_else(|| ApiError::unauthorized("unknown refresh token"))?;

    if let Some(revoked) = row.revoked_at {
        if (Utc::now() - revoked).num_seconds() < ROTATION_GRACE_SECS {
            return Err(Rotation::Grace);
        }
        revoke_family(&mut *tx, row.family_id).await?;
        tx.commit().await.map_err(ApiError::from)?;
        tracing::warn!(login = %row.user.login, family = %row.family_id, "refresh token reuse, session revoked");
        return Err(ApiError::unauthorized("refresh token reuse detected, session revoked").into());
    }
    if row.expires_at <= Utc::now() {
        return Err(ApiError::unauthorized("refresh token expired").into());
    }
    if !row.user.active {
        revoke_family(&mut *tx, row.family_id).await?;
        tx.commit().await.map_err(ApiError::from)?;
        return Err(ApiError::Status(StatusCode::FORBIDDEN, "account disabled".into()).into());
    }

    let who = row.user.identity()?;
    let (new_id, new_token) =
        store_refresh(&mut tx, s, who.id, row.family_id, user_agent(headers)).await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1")
        .bind(row.id)
        .bind(new_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    tx.commit().await.map_err(ApiError::from)?;
    Ok((who, new_token))
}

/// Ends this session (the refresh-token family). The access token simply expires.
#[utoipa::path(post, summary = "Выход: завершить эту сессию", path = "/api/auth/logout", tag = "auth", request_body(content = Option<RefreshBody>),
    responses((status = 204, description = "Сессия завершена")))]
async fn logout(
    State(s): State<AppState>,
    jar: CookieJar,
    body: Option<Json<RefreshBody>>,
) -> Result<(CookieJar, StatusCode), ApiError> {
    if let Some(token) = presented_token(&jar, body.map(|b| b.0)) {
        let family: Option<Uuid> =
            sqlx::query_scalar("SELECT family_id FROM refresh_tokens WHERE token_hash = $1")
                .bind(tokens::hash(&token))
                .fetch_optional(&s.db)
                .await?;
        if let Some(f) = family {
            revoke_family(&s.db, f).await?;
        }
    }
    Ok((clear_cookie(jar), StatusCode::NO_CONTENT))
}

/// Ends every session of the caller (all devices).
#[utoipa::path(post, summary = "Выход на всех устройствах", path = "/api/auth/logout-all", tag = "auth", security(("bearer" = [])),
    responses((status = 204, description = "Все сессии завершены"), (status = 401, body = ErrorBody)))]
async fn logout_all(
    State(s): State<AppState>,
    user: AuthUser,
    jar: CookieJar,
) -> Result<(CookieJar, StatusCode), ApiError> {
    revoke_user_sessions(&s.db, user.id()).await?;
    Ok((clear_cookie(jar), StatusCode::NO_CONTENT))
}

async fn revoke_user_sessions(db: &sqlx::PgPool, user_id: Uuid) -> Result<(), ApiError> {
    sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user_id)
        .execute(db)
        .await?;
    Ok(())
}

/// Текущий пользователь и его права.
#[utoipa::path(get, path = "/api/auth/me", tag = "auth", security(("bearer" = [])),
    responses((status = 200, body = UserView), (status = 401, body = ErrorBody)))]
async fn me(State(s): State<AppState>, user: AuthUser) -> ApiResult<UserView> {
    Ok(Json(user_view(&s.db, user.id()).await?))
}

#[derive(Serialize, ToSchema)]
struct Ticket {
    ticket: String,
    expires_in: u64,
}

/// Short-lived token for `GET /api/stream?ticket=…` (EventSource cannot set headers).
#[utoipa::path(post, summary = "Билет на 60 с для live-потока /api/stream", path = "/api/auth/stream-ticket", tag = "auth", security(("bearer" = [])),
    responses((status = 200, body = Ticket), (status = 401, body = ErrorBody)))]
async fn stream_ticket(State(s): State<AppState>, user: AuthUser) -> ApiResult<Ticket> {
    user.require(Perm::ObjectsRead)?;
    let who = UserIdentity {
        id: user.0.sub,
        login: user.0.login.clone(),
        display_name: user.0.name.clone(),
        role: user.0.role,
    };
    let (ticket, ttl) = s.auth.issue(&who, TokenKind::Stream)?;
    Ok(Json(Ticket { ticket, expires_in: ttl.as_secs() }))
}

#[derive(Serialize, ToSchema)]
struct RoleInfo {
    role: Role,
    permissions: Vec<Perm>,
}

/// The role → permission matrix, for the admin UI.
#[utoipa::path(get, summary = "Роли и их права", path = "/api/auth/roles", tag = "auth", security(("bearer" = [])),
    responses((status = 200, body = Vec<RoleInfo>), (status = 401, body = ErrorBody)))]
async fn roles(user: AuthUser) -> ApiResult<Vec<RoleInfo>> {
    user.require(Perm::UsersManage)?;
    Ok(Json(
        Role::ALL.into_iter().map(|role| RoleInfo { role, permissions: role.permissions() }).collect(),
    ))
}

/// Все пользователи (нужно право users_manage).
#[utoipa::path(get, path = "/api/users", tag = "users", security(("bearer" = [])),
    responses((status = 200, body = Vec<UserView>), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody)))]
async fn list_users(State(s): State<AppState>, user: AuthUser) -> ApiResult<Vec<UserView>> {
    user.require(Perm::UsersManage)?;
    let rows = sqlx::query_as::<_, UserRow>(
        "SELECT id, login, display_name, role, active, created_at, last_login_at
         FROM users ORDER BY role, login",
    )
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize, ToSchema)]
struct CreateUser {
    login: String,
    display_name: String,
    role: Role,
    password: String,
}

#[utoipa::path(post, summary = "Создать пользователя", path = "/api/users", tag = "users", request_body = CreateUser, security(("bearer" = [])),
    responses((status = 201, body = UserView), (status = 400, body = ErrorBody), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody),
              (status = 409, description = "Логин занят", body = ErrorBody)))]
async fn create_user(
    State(s): State<AppState>,
    user: AuthUser,
    Json(b): Json<CreateUser>,
) -> Result<(StatusCode, Json<UserView>), ApiError> {
    user.require(Perm::UsersManage)?;
    let row = insert_user(&s.db, &b.login, &b.display_name, b.role, &b.password).await?;
    tracing::info!(by = %user.0.login, login = %row.login, role = %row.role, "user created");
    Ok((StatusCode::CREATED, Json(row.into())))
}

#[derive(Deserialize, ToSchema)]
struct UpdateUser {
    display_name: Option<String>,
    role: Option<Role>,
    active: Option<bool>,
    password: Option<String>,
}

/// Role, activity or password changes end the user's sessions; the current
/// access token stays valid until it expires (≤ ACCESS_TTL_SECS).
#[utoipa::path(patch, summary = "Изменить пользователя; смена роли, пароля или блокировка завершают его сессии", path = "/api/users/{id}", tag = "users", params(("id" = Uuid, Path)), request_body = UpdateUser, security(("bearer" = [])),
    responses((status = 200, body = UserView), (status = 400, body = ErrorBody), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody), (status = 404, body = ErrorBody)))]
async fn update_user(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(b): Json<UpdateUser>,
) -> ApiResult<UserView> {
    user.require(Perm::UsersManage)?;
    if id == user.id() && (b.active == Some(false) || b.role.is_some_and(|r| r != Role::Admin)) {
        return Err(ApiError::bad_request("cannot disable or demote yourself"));
    }
    let hash = match &b.password {
        Some(p) if p.chars().count() < password::MIN_LEN => {
            return Err(ApiError::bad_request(format!(
                "password must be at least {} characters",
                password::MIN_LEN
            )))
        }
        Some(p) => Some(password::hash_blocking(p.clone()).await?),
        None => None,
    };
    let updated = sqlx::query(
        "UPDATE users SET
            display_name  = COALESCE($2, display_name),
            role          = COALESCE($3, role),
            active        = COALESCE($4, active),
            password_hash = COALESCE($5, password_hash)
         WHERE id = $1",
    )
    .bind(id)
    .bind(b.display_name.as_deref().map(str::trim))
    .bind(b.role.map(Role::as_str))
    .bind(b.active)
    .bind(hash)
    .execute(&s.db)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::not_found("user not found"));
    }
    if b.role.is_some() || b.active == Some(false) || b.password.is_some() {
        revoke_user_sessions(&s.db, id).await?;
    }
    tracing::info!(by = %user.0.login, user = %id, "user updated");
    Ok(Json(user_view(&s.db, id).await?))
}

#[cfg(test)]
mod tests {
    #[test]
    fn login_normalization() {
        assert_eq!(super::normalize_login("  Ivanova.A ").ok(), Some("ivanova.a".into()));
        assert!(super::normalize_login("a").is_err());
        assert!(super::normalize_login("иванова").is_err());
        assert!(super::normalize_login("x y").is_err());
    }
}
