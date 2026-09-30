import type { Pool } from "pg";
import type { Auth } from "./auth";
import type { Config } from "./config";

export interface Deps {
  config: Config;
  pool: Pool;
  auth: Auth;
  version: { version: string; commit: string; startedAt: string };
}
