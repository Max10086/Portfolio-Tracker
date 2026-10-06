#!/usr/bin/env node
/**
 * Apply supabase/migrations/006_asset_display_names.sql to the linked Supabase project.
 * Requires SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local (Dashboard → Database → Connection string).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function buildDatabaseUrl(env) {
  if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
  const password = env.SUPABASE_DB_PASSWORD?.trim();
  const ref = env.SUPABASE_PROJECT_REF?.trim() || 'qmfozxbzurkglweftfel';
  const region = env.SUPABASE_DB_REGION?.trim() || 'us-east-1';
  if (!password) return null;
  const user = `postgres.${ref}`;
  const host = `aws-0-${region}.pooler.supabase.com`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:6543/postgres`;
}

const env = { ...loadEnvLocal(), ...process.env };
const connectionString = buildDatabaseUrl(env);

if (!connectionString) {
  console.error(
    'Missing DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local.\n' +
      'Supabase Dashboard → Project Settings → Database → Connection string (URI, pooler, port 6543).'
  );
  process.exit(1);
}

const migrationFiles = [
  '006_asset_display_names.sql',
  '007_asset_stop_loss.sql',
];
const sql = migrationFiles
  .map((name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'))
  .join('\n\n');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  const check = await client.query(
    `SELECT to_regclass('public.asset_display_names') AS reg`
  );
  console.log('Migration 006 applied. Table:', check.rows[0]?.reg ?? 'missing');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
