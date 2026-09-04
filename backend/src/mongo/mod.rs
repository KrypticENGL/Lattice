//! MongoDB — where the user's *work* lives.
//!
//! The split with Postgres is deliberate and absolute: Postgres holds
//! identity (who you are, what role you have, when you signed in) and
//! Mongo holds everything you make (canvases, graphs, posts).
//! Nothing is stored in both, and nothing joins across them — a Mongo
//! document references its owner by the Clerk user id, the same string
//! that is the primary key over in `users`, but the database can't enforce
//! that and doesn't pretend to. `users::ensure` keeps the Postgres side
//! honest; a document whose owner has been deleted is cleaned up
//! explicitly (see `delete_owner`), not by a cascade.
//!
//! Why Mongo for this half: a canvas, a graph and a post are each read and
//! written whole, as one document, and their shapes are the frontend's to
//! change. That is the case a document store is actually for, and it is
//! exactly the case where a relational schema would mean a migration every
//! time the editor learns a new block.
//!
//! ## Timestamps are RFC 3339 strings, not BSON dates
//!
//! Because they cross a serde boundary twice with different targets. The
//! same struct is serialized *into* BSON for storage and *into* JSON for
//! the HTTP response, and a `bson::DateTime` (or a chrono field using
//! bson's serde helper) renders as `{"$date": ...}` in the JSON — which is
//! not what the frontend's `updated_at: string` expects. UTC RFC 3339
//! sorts lexicographically in exactly chronological order, so Mongo's own
//! `sort` works on them unchanged. The cost is that date operators in
//! aggregation pipelines don't apply; nothing here needs them.

use mongodb::bson::doc;
use mongodb::options::{ClientOptions, IndexOptions};
use mongodb::{Client, Collection, Database, IndexModel};

/// Collection names, in one place so a typo is a compile error rather than
/// a silently empty query.
pub const CANVASES: &str = "canvases";
pub const CODE_CANVASES: &str = "code_canvases";
pub const POSTS: &str = "posts";
pub const TRACE_RUNS: &str = "trace_runs";

/// Connects, verifies the connection is actually usable, and ensures the
/// indexes exist.
///
/// The ping is not ceremony: `Client::with_uri_str` only parses the URI
/// and sets up a connection pool lazily, so a wrong password or an IP that
/// isn't on the Atlas access list "connects" fine here and then fails on
/// the first real query. Forcing a round-trip now turns that into one
/// clear error at startup instead of a confusing 500 later.
pub async fn connect(uri: &str, database: &str) -> mongodb::error::Result<Database> {
    let mut options = ClientOptions::parse(uri).await?;
    options.app_name = Some("lattice-backend".to_string());
    let client = Client::with_options(options)?;
    let db = client.database(database);
    db.run_command(doc! { "ping": 1 }).await?;
    ensure_indexes(&db).await?;
    Ok(db)
}

pub fn collection<T: Send + Sync>(db: &Database, name: &str) -> Collection<T> {
    db.collection::<T>(name)
}

/// Creates the indexes every query in this backend relies on.
///
/// Idempotent — Mongo treats creating an index that already exists as a
/// no-op — so this runs unconditionally on every boot rather than being
/// gated behind a migration table. There is no schema to migrate here;
/// the indexes are the only structure the database itself holds.
async fn ensure_indexes(db: &Database) -> mongodb::error::Result<()> {
    // Documents carry their own `id` field rather than putting the uuid in
    // `_id`. The reason is a serde one: these structs are serialized twice
    // against different targets — into BSON to store, into JSON to answer
    // a request — and serde can't give a field one name per format. Naming
    // it `_id` would put `_id` in the HTTP response too, where every
    // caller (and every route that builds a URL out of it) expects `id`.
    // Mongo still assigns its own `_id`; nothing reads it. The unique
    // index below is what makes `id` a real key.
    for name in [CANVASES, CODE_CANVASES, POSTS, TRACE_RUNS] {
        db.collection::<mongodb::bson::Document>(name)
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(IndexOptions::builder().unique(true).build())
                    .build(),
            )
            .await?;
    }

    // "This user's work, newest first" is the only way either owned
    // collection is ever listed.
    for name in [CANVASES, CODE_CANVASES] {
        db.collection::<mongodb::bson::Document>(name)
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "owner_id": 1, "updated_at": -1 })
                    .build(),
            )
            .await?;
    }

    // Recent Traces and the Activity heatmap both read this one newest-first
    // — see `crate::trace_runs`.
    db.collection::<mongodb::bson::Document>(TRACE_RUNS)
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner_id": 1, "ran_at": -1 })
                .build(),
        )
        .await?;

    // One derived canvas per graph — the constraint that makes pressing
    // Visualize twice refresh a canvas instead of creating a second one.
    // Partial rather than sparse: every hand-written canvas has
    // `code_canvas_id: null`, and a plain unique index would let only one
    // of them exist.
    db.collection::<mongodb::bson::Document>(CANVASES)
        .create_index(
            IndexModel::builder()
                .keys(doc! { "code_canvas_id": 1 })
                .options(
                    IndexOptions::builder()
                        .unique(true)
                        .partial_filter_expression(doc! { "code_canvas_id": { "$type": "string" } })
                        .build(),
                )
                .build(),
        )
        .await?;

    // The feed is global and reverse-chronological; the owner index backs
    // "posts by this author".
    let posts = db.collection::<mongodb::bson::Document>(POSTS);
    posts
        .create_index(IndexModel::builder().keys(doc! { "published_at": -1 }).build())
        .await?;
    posts
        .create_index(IndexModel::builder().keys(doc! { "owner_id": 1 }).build())
        .await?;

    Ok(())
}

/// Erases everything a user made. Called when Clerk reports the account
/// deleted (see `api::webhooks`), because Postgres's `ON DELETE CASCADE`
/// stops at its own database — without this, a deleted user's canvases and
/// posts would linger with an owner id that resolves to nobody.
pub async fn delete_owner(db: &Database, owner_id: &str) -> mongodb::error::Result<u64> {
    let mut deleted = 0;
    for name in [CANVASES, CODE_CANVASES, POSTS, TRACE_RUNS] {
        let result = db
            .collection::<mongodb::bson::Document>(name)
            .delete_many(doc! { "owner_id": owner_id })
            .await?;
        deleted += result.deleted_count;
    }
    Ok(deleted)
}

/// `now` in the string form documented at the top of this module.
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
