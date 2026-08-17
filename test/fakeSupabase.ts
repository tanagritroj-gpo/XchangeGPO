// Minimal in-memory stand-in for the Supabase JS query builder, just enough
// to exercise the state-machine logic in app/actions/*.ts without hitting a
// real database. Supports the subset of the fluent API this codebase
// actually uses: select/insert/update/delete, eq/neq/in filters (AND-combined),
// order (no-op — tests don't depend on row order), single/maybeSingle.
//
// Not a general-purpose Postgrest mock — extend it if a new action needs a
// method it doesn't support yet, rather than reaching for a heavier tool.

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

// Columns with a real unique constraint in Postgres, worth modeling here so
// tests can exercise the 23505 duplicate-key error path (e.g. b2b_customers
// re-provisioning an already-used email) without needing a real DB. Extend
// this map rather than special-casing individual tests.
const UNIQUE_COLUMNS: Record<string, string[]> = {
  b2b_customers: ['email'],
  clients: ['email'],
};

class FakeQueryBuilder {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private updateValues?: Row;
  private insertValues?: Row | Row[];
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private wantsCount = false;
  private projectColumns?: string[];

  constructor(
    private tables: Tables,
    private tableName: string,
    private nextId: (table: string) => number,
  ) {}

  // Real column projection only for plain flat lists (no '*', no '(' relationship/join
  // syntax) — this codebase relies on that exact shape in several places to keep sensitive
  // columns (money, invoice numbers, compliance notes) out of public-facing responses
  // (see app/actions/tracking-actions.ts SAFE_DRUG_ITEM_COLUMNS), so it's worth this fake
  // actually enforcing it rather than being a no-op that would hide a regression there.
  // Anything with '*' or '(' (joins/relationships this fake doesn't resolve anyway) is left
  // unprojected exactly as before, since seeded fixtures for those embed the joined shape
  // directly on the row and many existing tests depend on the full row passing through.
  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== 'insert' && this.mode !== 'update' && this.mode !== 'delete') {
      this.mode = 'select';
    }
    if (opts?.count) this.wantsCount = true;
    if (cols && !cols.includes('*') && !cols.includes('(')) {
      this.projectColumns = cols.split(',').map((c) => c.trim());
    }
    return this;
  }

  insert(values: Row | Row[]) {
    this.mode = 'insert';
    this.insertValues = values;
    return this;
  }

  update(values: Row) {
    this.mode = 'update';
    this.updateValues = values;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }

  // IS NULL treats a genuinely missing key the same as an explicit null — matches real
  // Postgres semantics (a column that was never set still reads as NULL), and is..(col, true/false)
  // for anything else this codebase uses .is() for.
  is(col: string, val: any) {
    if (val === null) {
      this.filters.push((r) => r[col] == null);
    } else {
      this.filters.push((r) => r[col] === val);
    }
    return this;
  }

  // Only the two shapes actually used in this codebase (grep .not( under app/actions, lib):
  // .not(col, 'is', null) and .not(col, 'in', array) — extend if a new usage appears.
  // 'in' accepts either a real array OR Postgrest's raw filter-string syntax
  // '(a,b,c)' (notification-actions.ts passes SLA_NOTIFICATION_TYPES as that literal
  // string, not an array — matches what the real supabase-js client expects here).
  not(col: string, operator: 'is' | 'in', value: any) {
    if (operator === 'is') {
      this.filters.push((r) => r[col] !== value);
    } else if (operator === 'in') {
      const list = typeof value === 'string' ? value.replace(/^\(|\)$/g, '').split(',') : (value as any[]);
      const excluded = new Set(list);
      this.filters.push((r) => !excluded.has(r[col]));
    } else {
      throw new Error(`fakeSupabase: unsupported .not() operator "${operator}"`);
    }
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((r) => r[col] >= val);
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push((r) => r[col] > val);
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push((r) => r[col] <= val);
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((r) => r[col] < val);
    return this;
  }

  ilike(col: string, pattern: string) {
    // แปลง SQL LIKE pattern (%..%) เป็น regex ง่ายๆ พอสำหรับ test — รองรับ
    // เฉพาะ %wildcard% ที่โค้ดจริงในโปรเจกต์ใช้ ไม่ใช่ full LIKE syntax
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    const re = new RegExp(`^${escaped}$`, 'i');
    this.filters.push((r) => typeof r[col] === 'string' && re.test(r[col]));
    return this;
  }

  order(..._args: any[]) {
    return this;
  }

  limit(..._args: any[]) {
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantsMaybeSingle = true;
    return this;
  }

  private table() {
    if (!this.tables[this.tableName]) this.tables[this.tableName] = [];
    return this.tables[this.tableName];
  }

  private matched() {
    return this.table().filter((r) => this.filters.every((f) => f(r)));
  }

  // Makes the builder awaitable, mirroring the real Postgrest builder.
  then(
    resolve: (v: { data: any; error: any; count?: number }) => void,
    reject?: (e: any) => void,
  ) {
    try {
      let data: any;

      if (this.mode === 'select') {
        const rows = this.matched();
        if (this.wantsSingle) {
          data = rows[0];
          if (!data) {
            resolve({ data: null, error: { message: `${this.tableName}: no row found` } });
            return;
          }
        } else if (this.wantsMaybeSingle) {
          data = rows[0] ?? null;
        } else {
          data = rows;
        }
        if (this.projectColumns) {
          const project = (row: Row) => Object.fromEntries(this.projectColumns!.map((c) => [c, row[c]]));
          data = Array.isArray(data) ? data.map(project) : (data ? project(data) : data);
        }
      } else if (this.mode === 'update') {
        const rows = this.matched();
        rows.forEach((r) => Object.assign(r, this.updateValues));
        data = this.wantsSingle ? rows[0] : rows;
      } else if (this.mode === 'insert') {
        const arr = Array.isArray(this.insertValues) ? this.insertValues : [this.insertValues!];
        const uniqueCols = UNIQUE_COLUMNS[this.tableName] ?? [];
        for (const v of arr) {
          for (const col of uniqueCols) {
            if (v[col] != null && this.table().some((r) => r[col] === v[col])) {
              resolve({
                data: null,
                error: {
                  message: `duplicate key value violates unique constraint "${this.tableName}_${col}_key"`,
                  code: '23505',
                },
              });
              return;
            }
          }
        }
        const inserted = arr.map((v) => ({ id: this.nextId(this.tableName), ...v }));
        this.table().push(...inserted);
        data = this.wantsSingle ? inserted[0] : inserted;
        // `.insert(...).select('id')` projection matters here for the same reason as plain
        // selects — e.g. auth.ts registers a client and deliberately selects only 'id' so
        // password_hash never round-trips back to the caller. Project against `inserted`
        // (has the generated id) rather than the raw input values.
        if (this.projectColumns) {
          const project = (row: Row) => Object.fromEntries(this.projectColumns!.map((c) => [c, row[c]]));
          data = Array.isArray(data) ? data.map(project) : project(data);
        }
      } else if (this.mode === 'delete') {
        const rows = this.matched();
        this.tables[this.tableName] = this.table().filter((r) => !rows.includes(r));
        data = rows;
      }

      resolve({ data, error: null, count: this.wantsCount ? this.matched().length : undefined });
    } catch (e) {
      if (reject) reject(e);
      else resolve({ data: null, error: e });
    }
  }
}

// Minimal in-memory stand-in for Supabase Storage — just upload/download/
// createSignedUrl, keyed by bucket+path. Enough to test code that generates a
// file and hands back a signed URL, without a real bucket.
//
// Bucket handles are memoized (one object per bucket name, reused across
// calls) rather than freshly constructed on every `.from(bucket)` — so a test
// that does `vi.spyOn(fake.storage.from('x'), 'upload')` actually intercepts
// the *same* method the code under test calls later, instead of spying on a
// throwaway object nobody else references.
function createFakeStorage() {
  const buckets: Record<string, Record<string, Uint8Array>> = {};
  const handles: Record<string, ReturnType<typeof makeHandle>> = {};

  function makeHandle(bucket: string) {
    if (!buckets[bucket]) buckets[bucket] = {};
    return {
      async upload(path: string, bytes: any) {
        buckets[bucket][path] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return { data: { path }, error: null };
      },
      async download(path: string) {
        const bytes = buckets[bucket][path];
        if (!bytes) return { data: null, error: { message: 'not found' } };
        return { data: new Blob([bytes as BlobPart]), error: null };
      },
      async createSignedUrl(path: string, _expiresIn: number) {
        if (!buckets[bucket][path]) return { data: null, error: { message: 'not found' } };
        return { data: { signedUrl: `https://fake-storage.test/${bucket}/${path}` }, error: null };
      },
    };
  }

  return {
    from(bucket: string) {
      if (!handles[bucket]) handles[bucket] = makeHandle(bucket);
      return handles[bucket];
    },
  };
}

type RpcResult = { data: any; error: any };
type RpcHandler = (params: any) => RpcResult | Promise<RpcResult>;

export function createFakeAdmin() {
  let tables: Tables = {};
  const idCounters: Record<string, number> = {};
  // Postgres RPC functions (SECURITY DEFINER stored procedures) — no generic
  // simulation here, since their real logic lives in SQL migrations, not this
  // file. Tests register a handler per function name via setRpcHandler(),
  // written from the actual migration SQL (e.g. create_exchange_request in
  // supabase/migrations/20260816150000_*.sql), so a test can still exercise
  // real insert/error paths through fakeAdmin.client.from(...) inside it.
  const rpcHandlers: Record<string, RpcHandler> = {};

  const nextId = (table: string) => {
    idCounters[table] = (idCounters[table] ?? 0) + 1;
    return idCounters[table];
  };

  const client = {
    from(tableName: string) {
      return new FakeQueryBuilder(tables, tableName, nextId);
    },
    storage: createFakeStorage(),
    async rpc(fnName: string, params?: any): Promise<RpcResult> {
      const handler = rpcHandlers[fnName];
      if (!handler) {
        return { data: null, error: { message: `fakeSupabase: no rpc handler registered for "${fnName}" — call setRpcHandler() in the test first` } };
      }
      return handler(params);
    },
  };

  return {
    client,
    /** Replace all table contents (deep-cloned so tests can't mutate their own fixtures by accident). */
    seed(newTables: Tables) {
      tables = structuredClone(newTables);
      for (const key of Object.keys(idCounters)) delete idCounters[key];
    },
    /** Read current in-memory rows for assertions. */
    rows(tableName: string): Row[] {
      return tables[tableName] ?? [];
    },
    /** Register (or replace) the fake implementation of a `supabaseAdmin.rpc(fnName, ...)` call. */
    setRpcHandler(fnName: string, handler: RpcHandler) {
      rpcHandlers[fnName] = handler;
    },
  };
}
