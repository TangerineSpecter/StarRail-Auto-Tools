//! Inventory bounded context.
//!
//! Models form the command-facing contract; the SQLite repository owns persistence.
//! Optimisation remains deliberately pure except for candidate loading.
mod build_plan_excel;
mod models;
mod normalizer;
mod repository;

pub use models::*;
pub use normalizer::*;
