//! Object storage for uploaded photos: any S3 (SeaweedFS locally, a cloud S3 in
//! prod) or, without `S3_ENDPOINT`, a local folder — so the stack still runs
//! when no S3 is around.
//!
//! Env: `S3_ENDPOINT`, `S3_BUCKET` (mgts-frames), `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
//! `S3_REGION` (us-east-1); fallback `UPLOAD_DIR` (../data/uploads).

use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::{bail, Context};
use s3::{creds::Credentials, Bucket, BucketConfiguration, Region};

#[derive(Clone)]
pub struct Storage(Arc<Backend>);

enum Backend {
    S3(Box<Bucket>),
    Local(PathBuf),
}

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|s| !s.is_empty())
}

impl Storage {
    pub async fn from_env() -> anyhow::Result<Self> {
        let Some(endpoint) = env("S3_ENDPOINT") else {
            let dir = PathBuf::from(env("UPLOAD_DIR").unwrap_or_else(|| "../data/uploads".into()));
            tokio::fs::create_dir_all(&dir).await.with_context(|| format!("create {}", dir.display()))?;
            let dir = tokio::fs::canonicalize(&dir).await?;
            tracing::warn!("S3_ENDPOINT not set: uploads go to local folder {}", dir.display());
            return Ok(Self(Arc::new(Backend::Local(dir))));
        };
        let name = env("S3_BUCKET").unwrap_or_else(|| "mgts-frames".into());
        let region = Region::Custom {
            region: env("S3_REGION").unwrap_or_else(|| "us-east-1".into()),
            endpoint: endpoint.clone(),
        };
        let creds = Credentials::new(
            env("S3_ACCESS_KEY").as_deref(),
            env("S3_SECRET_KEY").as_deref(),
            None,
            None,
            None,
        )?;
        let bucket = Bucket::new(&name, region.clone(), creds.clone())?.with_path_style();

        // The S3 container may still be starting: retry, then create the bucket once.
        let mut last = None;
        for _ in 0..20 {
            match bucket.exists().await {
                Ok(true) => {
                    tracing::info!("S3 bucket {name} at {endpoint}");
                    return Ok(Self(Arc::new(Backend::S3(bucket))));
                }
                Ok(false) => {
                    let r = Bucket::create_with_path_style(&name, region.clone(), creds.clone(), BucketConfiguration::default())
                        .await?;
                    if !(200..300).contains(&r.response_code) {
                        bail!("create bucket {name}: HTTP {} {}", r.response_code, r.response_text);
                    }
                    tracing::info!("S3 bucket {name} created at {endpoint}");
                    return Ok(Self(Arc::new(Backend::S3(bucket))));
                }
                Err(e) => last = Some(e),
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        bail!("S3 at {endpoint} unreachable: {:?}", last)
    }

    /// `s3://bucket/key` or `file:///abs/path` — goes into `frames.ingested`.
    pub fn uri(&self, key: &str) -> String {
        match &*self.0 {
            Backend::S3(b) => format!("s3://{}/{key}", b.name),
            Backend::Local(dir) => format!("file://{}", dir.join(key).display()),
        }
    }

    pub async fn put(&self, key: &str, bytes: &[u8], content_type: &str) -> anyhow::Result<()> {
        let key = checked(key)?;
        match &*self.0 {
            Backend::S3(b) => {
                let r = b.put_object_with_content_type(key, bytes, content_type).await?;
                if !(200..300).contains(&r.status_code()) {
                    bail!("S3 put {key}: HTTP {}", r.status_code());
                }
            }
            Backend::Local(dir) => {
                let path = dir.join(key);
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                tokio::fs::write(path, bytes).await?;
            }
        }
        Ok(())
    }

    /// `None` when there is no such object.
    pub async fn get(&self, key: &str) -> anyhow::Result<Option<Vec<u8>>> {
        let key = checked(key)?;
        match &*self.0 {
            Backend::S3(b) => {
                let r = b.get_object(key).await?;
                match r.status_code() {
                    200..=299 => Ok(Some(r.bytes().to_vec())),
                    404 => Ok(None),
                    c => bail!("S3 get {key}: HTTP {c}"),
                }
            }
            Backend::Local(dir) => match tokio::fs::read(dir.join(key)).await {
                Ok(b) => Ok(Some(b)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e.into()),
            },
        }
    }
}

/// Keys are ours (`frames/…`), but the media route takes them from the URL:
/// plain relative paths only, no `..`.
pub fn valid_key(key: &str) -> bool {
    checked(key).is_ok()
}

fn checked(key: &str) -> anyhow::Result<&str> {
    let ok = !key.is_empty() && Path::new(key).components().all(|c| matches!(c, Component::Normal(_)));
    if !ok {
        bail!("bad storage key");
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    #[test]
    fn keys() {
        assert!(super::checked("frames/2026/11/26/ab.jpg").is_ok());
        assert!(super::checked("../x").is_err());
        assert!(super::checked("/etc/passwd").is_err());
        assert!(super::checked("").is_err());
    }
}
