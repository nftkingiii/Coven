import { Pool } from "pg";
import type { RegistryHistoryRecord } from "./registry-history.js";

type StoredRecord = {
  transaction_hash: string;
  registry_address: string;
  asset_address: string;
  commitment: string;
  nullifier: string;
  issuer: string;
  issued_at: string;
  block_number: string;
  explorer_url: string;
};

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;

export function registryStoreConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function database() {
  if (!registryStoreConfigured()) return undefined;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function ensureRegistryStore() {
  const client = database();
  if (!client) return false;
  if (!initialized) {
    initialized = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS coven_registry_records (
          transaction_hash TEXT PRIMARY KEY,
          registry_address TEXT NOT NULL,
          asset_address TEXT NOT NULL,
          commitment TEXT NOT NULL,
          nullifier TEXT NOT NULL,
          issuer TEXT NOT NULL,
          issued_at BIGINT NOT NULL,
          block_number BIGINT NOT NULL,
          explorer_url TEXT NOT NULL
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS coven_registry_records_issuer_idx
        ON coven_registry_records (LOWER(issuer));
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS coven_registry_scan_state (
          registry_address TEXT PRIMARY KEY,
          scanned_to_block BIGINT NOT NULL
        );
      `);
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  }
  await initialized;
  return true;
}

function asRecord(row: StoredRecord): RegistryHistoryRecord {
  return {
    transactionHash: row.transaction_hash as `0x${string}`,
    registryAddress: row.registry_address as `0x${string}`,
    assetAddress: row.asset_address as `0x${string}`,
    commitment: row.commitment as `0x${string}`,
    nullifier: row.nullifier as `0x${string}`,
    issuer: row.issuer as `0x${string}`,
    issuedAt: Number(row.issued_at),
    blockNumber: row.block_number,
    explorerUrl: row.explorer_url,
  };
}

export async function readStoredRegistryRecords(registryAddress: string) {
  const client = database();
  if (!client || !(await ensureRegistryStore())) return [];
  const result = await client.query<StoredRecord>(
    `SELECT transaction_hash, registry_address, asset_address, commitment, nullifier,
            issuer, issued_at, block_number, explorer_url
       FROM coven_registry_records
      WHERE LOWER(registry_address) = LOWER($1)
      ORDER BY issued_at DESC, block_number DESC`,
    [registryAddress],
  );
  return result.rows.map(asRecord);
}

export async function upsertStoredRegistryRecords(records: RegistryHistoryRecord[]) {
  const client = database();
  if (!client || records.length === 0 || !(await ensureRegistryStore())) return;
  const values: unknown[] = [];
  const rows = records.map((record, index) => {
    const offset = index * 9;
    values.push(
      record.transactionHash,
      record.registryAddress,
      record.assetAddress,
      record.commitment,
      record.nullifier,
      record.issuer,
      record.issuedAt,
      record.blockNumber,
      record.explorerUrl,
    );
    return `(${Array.from({ length: 9 }, (_, part) => `$${offset + part + 1}`).join(", ")})`;
  });
  await client.query(
    `INSERT INTO coven_registry_records (
      transaction_hash, registry_address, asset_address, commitment, nullifier,
      issuer, issued_at, block_number, explorer_url
    ) VALUES ${rows.join(", ")}
    ON CONFLICT (transaction_hash) DO UPDATE SET
      registry_address = EXCLUDED.registry_address,
      asset_address = EXCLUDED.asset_address,
      commitment = EXCLUDED.commitment,
      nullifier = EXCLUDED.nullifier,
      issuer = EXCLUDED.issuer,
      issued_at = EXCLUDED.issued_at,
      block_number = EXCLUDED.block_number,
      explorer_url = EXCLUDED.explorer_url`,
    values,
  );
}

export async function readRegistryScanCursor(registryAddress: string) {
  const client = database();
  if (!client || !(await ensureRegistryStore())) return undefined;
  const result = await client.query<{ scanned_to_block: string }>(
    `SELECT scanned_to_block FROM coven_registry_scan_state
      WHERE LOWER(registry_address) = LOWER($1)`,
    [registryAddress],
  );
  return result.rows[0] ? BigInt(result.rows[0].scanned_to_block) : undefined;
}

export async function writeRegistryScanCursor(registryAddress: string, block: bigint) {
  const client = database();
  if (!client || !(await ensureRegistryStore())) return;
  await client.query(
    `INSERT INTO coven_registry_scan_state (registry_address, scanned_to_block)
     VALUES ($1, $2)
     ON CONFLICT (registry_address) DO UPDATE SET scanned_to_block = EXCLUDED.scanned_to_block`,
    [registryAddress, block.toString()],
  );
}
