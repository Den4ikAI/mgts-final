mod kafka;
mod projection;
mod routes;

use std::net::SocketAddr;

use anyhow::Context;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::broadcast;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

use domain::topics;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub producer: kafka::Producer,
    pub live: broadcast::Sender<String>,
    pub dev_endpoints: bool,
}

fn env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,api=debug".into()),
        )
        .init();

    let database_url = env("DATABASE_URL", "postgres://mgts:mgts@localhost:5432/mgts");
    let brokers = env("KAFKA_BROKERS", "localhost:19092");
    let addr: SocketAddr = env("BIND_ADDR", "0.0.0.0:8080").parse()?;

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .context("connect postgres")?;
    sqlx::migrate!("../../migrations").run(&db).await?;

    let producer = kafka::Producer::new(&brokers)?;
    let (live, _) = broadcast::channel(1024);

    let projection = projection::Projection {
        db: db.clone(),
        producer: producer.clone(),
        live: live.clone(),
    };
    let consumer = kafka::consumer(
        &brokers,
        "api-projection",
        &[topics::DETECTIONS, topics::OBJECT_EVENTS],
    )?;
    tokio::spawn(projection.run(consumer));

    let state = AppState {
        db,
        producer,
        live,
        dev_endpoints: env("DEV_ENDPOINTS", "1") != "0",
    };
    let app = routes::router(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    tracing::info!("listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
