//! Argon2id password hashing (PHC string format, salt embedded).
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub const MIN_LEN: usize = 8;

pub fn hash(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hash password: {e}"))
}

pub fn verify(password: &str, phc: &str) -> bool {
    PasswordHash::new(phc)
        .map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

/// Argon2 takes tens of ms of CPU; keep it off the async workers.
pub async fn verify_blocking(password: String, phc: String) -> bool {
    tokio::task::spawn_blocking(move || verify(&password, &phc))
        .await
        .unwrap_or(false)
}

pub async fn hash_blocking(password: String) -> anyhow::Result<String> {
    tokio::task::spawn_blocking(move || hash(&password)).await?
}

#[cfg(test)]
mod tests {
    #[test]
    fn hash_and_verify() {
        let h = super::hash("correct horse").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(super::verify("correct horse", &h));
        assert!(!super::verify("wrong", &h));
        assert!(!super::verify("x", "garbage"));
    }
}
