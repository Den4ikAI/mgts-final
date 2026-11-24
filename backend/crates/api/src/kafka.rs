use std::time::Duration;

use anyhow::Context;
use rdkafka::{
    consumer::{Consumer, StreamConsumer},
    producer::{FutureProducer, FutureRecord},
    ClientConfig,
};
use serde::Serialize;

use domain::Envelope;

#[derive(Clone)]
pub struct Producer {
    inner: FutureProducer,
}

impl Producer {
    pub fn new(brokers: &str) -> anyhow::Result<Self> {
        let inner = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("enable.idempotence", "true")
            .set("message.timeout.ms", "5000")
            .create()
            .context("create kafka producer")?;
        Ok(Self { inner })
    }

    pub async fn send<T: Serialize>(&self, topic: &str, env: &Envelope<T>) -> anyhow::Result<()> {
        let body = serde_json::to_vec(env)?;
        self.inner
            .send(
                FutureRecord::to(topic).key(&env.key).payload(&body),
                Duration::from_secs(5),
            )
            .await
            .map_err(|(e, _)| anyhow::anyhow!("kafka send to {topic}: {e}"))?;
        Ok(())
    }
}

pub fn consumer(brokers: &str, group: &str, topics: &[&str]) -> anyhow::Result<StreamConsumer> {
    let c: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group)
        .set("auto.offset.reset", "earliest")
        .set("enable.auto.commit", "true")
        .create()
        .context("create kafka consumer")?;
    c.subscribe(topics).context("subscribe")?;
    Ok(c)
}
