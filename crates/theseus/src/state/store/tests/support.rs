//! Minimal stand-in for the shared test pool helpers.

use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

pub(crate) async fn migrated_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    pool
}

pub(crate) async fn empty_pool() -> SqlitePool {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap()
}

pub(crate) async fn migrated_file_pool(
    path: impl AsRef<std::path::Path>,
) -> SqlitePool {
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    pool
}
