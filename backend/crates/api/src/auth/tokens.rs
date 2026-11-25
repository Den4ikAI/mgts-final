//! Opaque refresh tokens: 256 random bits, base64url; only SHA-256 goes to the DB.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    OsRng.fill_bytes(&mut b);
    b
}

/// Returns (token for the client, hash for the DB).
pub fn new_refresh() -> (String, Vec<u8>) {
    let token = URL_SAFE_NO_PAD.encode(random_bytes(32));
    let h = hash(&token);
    (token, h)
}

pub fn hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

#[cfg(test)]
mod tests {
    #[test]
    fn unique_and_hashed() {
        let (a, ha) = super::new_refresh();
        let (b, _) = super::new_refresh();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert_eq!(super::hash(&a), ha);
    }
}
