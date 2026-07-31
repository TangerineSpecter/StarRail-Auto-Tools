//! Inventory bounded context.
//!
//! Models form the command-facing contract; the SQLite repository owns persistence.
//! Optimisation remains deliberately pure except for candidate loading.
mod models;
mod repository;

pub use models::*;
