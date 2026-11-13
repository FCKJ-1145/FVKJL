//! Headless install check for one Minecraft version and optional loader.
//!
//! It drives the same install job the launcher queues, against an isolated
//! data directory, and prints the phase transitions plus the final result. Use
//! it to check that downloading and installing a version works without opening
//! the launcher, and to see why an install fails.
//!
//! ```text
//! cargo run -p theseus --example install_version -- 1.12.2
//! cargo run -p theseus --example install_version -- 1.12.2 forge
//! cargo run -p theseus --example install_version -- 1.20.1 fabric 0.15.11
//! cargo run -p theseus --example install_version -- 1.5.2 vanilla "" D:\mc-test
//! ```
//!
//! Arguments: `<game version> [loader] [loader version] [data dir]`.
//! Set `RESET=1` to start from an empty data directory.

#![recursion_limit = "512"]

use std::time::{Duration, Instant};
use theseus::install::InstallJobStatus;
use theseus::state::{InstanceLink, ModLoader};

fn loader_from(name: &str) -> ModLoader {
    match name {
        "vanilla" | "none" | "" => ModLoader::Vanilla,
        "fabric" => ModLoader::Fabric,
        "quilt" => ModLoader::Quilt,
        "forge" => ModLoader::Forge,
        "neoforge" => ModLoader::NeoForge,
        "optifine" => ModLoader::OptiFine,
        "cleanroom" => ModLoader::Cleanroom,
        "lite_loader" | "liteloader" => ModLoader::LiteLoader,
        "legacy_fabric" => ModLoader::LegacyFabric,
        "babric" => ModLoader::Babric,
        other => {
            eprintln!("unknown loader: {other}");
            std::process::exit(2);
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // The install job's future is deeply nested; an unoptimized build needs
    // more than the 2 MB a runtime worker gets by default, so the check runs
    // on a roomier runtime.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(32 * 1024 * 1024)
        .build()?;
    runtime.block_on(run())
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let Some(version) = args.next() else {
        eprintln!(
            "usage: install_version <game version> [loader] [loader version] [data dir]"
        );
        std::process::exit(2);
    };
    let loader_name = args.next().unwrap_or_else(|| "vanilla".to_string());
    let loader = loader_from(&loader_name);
    let loader_version = args
        .next()
        .filter(|value| !value.is_empty() && value != "-");
    let root = args
        .next()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("aster-install-check"));

    if std::env::var_os("RESET").is_some() {
        let _ = std::fs::remove_dir_all(&root);
    }
    std::fs::create_dir_all(&root)?;
    // SAFETY: no other thread reads the environment before `State::init`.
    unsafe {
        std::env::set_var("THESEUS_CONFIG_DIR", &root);
    }
    println!("data dir : {}", root.display());
    println!(
        "target   : {version} / {loader_name}{}",
        loader_version
            .as_deref()
            .map(|id| format!(" {id}"))
            .unwrap_or_default()
    );

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "theseus=warn".into()),
        )
        .init();

    theseus::State::init("aster-install-check".to_string()).await?;
    let job = theseus::install::create_instance(
        format!("check {version} {loader_name}"),
        version.clone(),
        loader,
        loader_version,
        None,
        InstanceLink::Unmanaged,
    )
    .await?;
    println!("job      : {}", job.job_id);

    let started = Instant::now();
    let mut last_phase = String::new();
    loop {
        let snapshot = theseus::install::get_job(job.job_id).await?;
        let phase = format!("{:?}", snapshot.phase);
        if phase != last_phase {
            println!("[{:>5}s] {phase}", started.elapsed().as_secs());
            last_phase.clone_from(&phase);
        }
        if snapshot.status.is_finished() {
            println!("result   : {:?}", snapshot.status);
            if let Some(error) = &snapshot.error {
                println!("error    : [{}] {}", error.code, error.message);
                if let Some(context) = &error.context {
                    println!("operation: {}", context.operation);
                    if !context.urls.is_empty() {
                        println!("urls     : {}", context.urls.join(", "));
                    }
                }
            }
            if snapshot.status != InstallJobStatus::Succeeded {
                std::process::exit(1);
            }
            return Ok(());
        }
        if started.elapsed() > Duration::from_secs(3600) {
            eprintln!("gave up after one hour; last phase {phase}");
            std::process::exit(1);
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}
