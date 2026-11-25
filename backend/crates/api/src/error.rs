use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// HTTP error: either a deliberate status with a client-facing message, or an
/// internal failure (logged, reported to the client as a bare 500).
pub enum ApiError {
    Status(StatusCode, String),
    Internal(anyhow::Error),
}

impl ApiError {
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::Status(StatusCode::UNAUTHORIZED, msg.into())
    }
    pub fn forbidden() -> Self {
        Self::Status(StatusCode::FORBIDDEN, "insufficient role".into())
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::Status(StatusCode::NOT_FOUND, msg.into())
    }
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::Status(StatusCode::BAD_REQUEST, msg.into())
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Status(StatusCode::CONFLICT, msg.into())
    }
    /// For non-HTTP callers (startup code).
    pub fn into_anyhow(self) -> anyhow::Error {
        match self {
            Self::Status(code, msg) => anyhow::anyhow!("{code}: {msg}"),
            Self::Internal(e) => e,
        }
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self::Internal(e.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::Status(code, msg) => {
                let mut res = (code, Json(json!({ "error": msg }))).into_response();
                if code == StatusCode::UNAUTHORIZED {
                    res.headers_mut()
                        .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
                }
                res
            }
            Self::Internal(e) => {
                tracing::error!("{e:#}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "internal error" })),
                )
                    .into_response()
            }
        }
    }
}

pub type ApiResult<T> = Result<Json<T>, ApiError>;
