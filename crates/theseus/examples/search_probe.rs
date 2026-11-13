//! Headless search pagination probe for the real resource providers.
//!
//! Drives the same `ResourceService` the launcher uses, against an isolated
//! data directory, and walks the first N pages of the mod browse. It prints,
//! per page, the entry count, the source mix, `has_more`, source failures and
//! exhausted sources — so a pagination stall is visible without the UI.
//!
//! ```text
//! cargo run -p theseus --example search_probe -- 40
//! ```

#![recursion_limit = "512"]

use theseus::resources::ipc::{
    ResourceSearchQuery, ResourceSearchSort, ResourceTarget,
};
use theseus::resources::{RequestId, ResourceError, ResourceType};
use tokio_util::sync::CancellationToken;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(32 * 1024 * 1024)
        .build()?;
    runtime.block_on(run())
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let pages: usize = std::env::args()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(40);
    let root = std::env::temp_dir().join("aster-search-probe");
    if std::env::var_os("RESET").is_some() {
        let _ = std::fs::remove_dir_all(&root);
    }
    std::fs::create_dir_all(&root)?;
    // SAFETY: no other thread reads the environment before `State::init`.
    unsafe {
        std::env::set_var("THESEUS_CONFIG_DIR", &root);
    }
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "theseus=warn".into()),
        )
        .init();

    theseus::State::init("aster-search-probe".to_string()).await?;
    let service = theseus::State::get().await?.resources().await?.clone();

    let query = ResourceSearchQuery {
        filter: None,
        text: String::new(),
        types: vec![ResourceType::Mod],
        sources: vec![],
        target: ResourceTarget {
            game_versions: vec![],
            loaders: vec![],
            channels: vec![],
        },
        categories: vec![],
        sort: ResourceSearchSort::Relevance,
        page_size: 20,
        translate: true,
    };

    let cancel = CancellationToken::new();
    let mut cursor = None;
    let mut total_seen = 0usize;
    for page_index in 0..pages {
        let page = match service
            .search(
                query.clone(),
                cursor,
                RequestId::new(format!("probe-{page_index}")).unwrap(),
                &cancel,
            )
            .await
        {
            Ok(page) => page,
            Err(ResourceError::CursorExpired) => {
                println!("page {page_index:>3}: CursorExpired");
                break;
            }
            Err(error) => {
                println!("page {page_index:>3}: error {error}");
                break;
            }
        };
        let mut by_source = std::collections::BTreeMap::new();
        for entry in &page.entries {
            *by_source
                .entry(entry.entry.default_project.source.as_str().to_string())
                .or_insert(0usize) += 1;
        }
        total_seen += page.entries.len();
        let failures: Vec<String> = page
            .source_failures
            .iter()
            .map(|failure| {
                format!("{}({})", failure.source.as_str(), failure.message)
            })
            .collect();
        println!(
            "page {page_index:>3}: entries={:>2} total_seen={:>4} has_more={} cursor={} mix={:?} failures={:?} exhausted={:?}",
            page.entries.len(),
            total_seen,
            page.has_more,
            page.cursor.is_some(),
            by_source,
            failures,
            page.exhausted_sources.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
        );
        if !page.has_more || page.cursor.is_none() {
            println!("page {page_index:>3}: reached the end of results");
            break;
        }
        cursor = page.cursor;
    }
    Ok(())
}
