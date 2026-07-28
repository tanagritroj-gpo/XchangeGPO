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

class FakeQueryBuilder {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private updateValues?: Row;
  private insertValues?: Row | Row[];
  private wantsSingle = false;
  private wantsMaybeSingle = false;

  constructor(
    private tables: Tables,
    private tableName: string,
    private nextId: (table: string) => number,
  ) {}

  select(_cols?: string) {
    if (this.mode !== 'insert' && this.mode !== 'update' && this.mode !== 'delete') {
      this.mode = 'select';
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
    resolve: (v: { data: any; error: any }) => void,
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
      } else if (this.mode === 'update') {
        const rows = this.matched();
        rows.forEach((r) => Object.assign(r, this.updateValues));
        data = this.wantsSingle ? rows[0] : rows;
      } else if (this.mode === 'insert') {
        const arr = Array.isArray(this.insertValues) ? this.insertValues : [this.insertValues!];
        const inserted = arr.map((v) => ({ id: this.nextId(this.tableName), ...v }));
        this.table().push(...inserted);
        data = this.wantsSingle ? inserted[0] : inserted;
      } else if (this.mode === 'delete') {
        const rows = this.matched();
        this.tables[this.tableName] = this.table().filter((r) => !rows.includes(r));
        data = rows;
      }

      resolve({ data, error: null });
    } catch (e) {
      if (reject) reject(e);
      else resolve({ data: null, error: e });
    }
  }
}

export function createFakeAdmin() {
  let tables: Tables = {};
  const idCounters: Record<string, number> = {};

  const nextId = (table: string) => {
    idCounters[table] = (idCounters[table] ?? 0) + 1;
    return idCounters[table];
  };

  const client = {
    from(tableName: string) {
      return new FakeQueryBuilder(tables, tableName, nextId);
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
  };
}
