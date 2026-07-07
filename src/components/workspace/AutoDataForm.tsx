import { useState } from "react";

type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };

function isPrimitiveArray(v: unknown): v is (string | number)[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number");
}
function isObjectArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function AutoDataForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });

  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>;
  }

  return (
    <div className="space-y-5">
      {entries.map(([key, value]) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">{key}</label>
          <FieldEditor value={value} onChange={(v) => set(key, v)} />
        </div>
      ))}
    </div>
  );
}

function FieldEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (typeof value === "string") {
    return value.length > 60 ? (
      <textarea
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    ) : (
      <input
        dir="auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }

  if (typeof value === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }

  if (value === null || value === undefined) {
    return (
      <input
        placeholder="(فارغ)"
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }

  if (isPrimitiveArray(value)) {
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              dir="auto"
              value={String(item)}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-md border border-input px-2 text-sm text-muted-foreground hover:bg-accent"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, ""])}
          className="rounded-md border border-dashed border-input px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          + إضافة عنصر
        </button>
      </div>
    );
  }

  if (isObjectArray(value)) {
    const columns = Array.from(
      value.reduce((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
    return (
      <div className="space-y-2">
        {value.map((row, i) => (
          <div
            key={i}
            className="grid gap-1.5 rounded-md border border-border p-2"
            style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) auto` }}
          >
            {columns.map((col) => (
              <input
                key={col}
                dir="auto"
                placeholder={col}
                value={String(row[col] ?? "")}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = { ...row, [col]: e.target.value };
                  onChange(next);
                }}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              />
            ))}
            <button
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-accent"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, Object.fromEntries(columns.map((c) => [c, ""]))])}
          className="rounded-md border border-dashed border-input px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          + إضافة صف
        </button>
      </div>
    );
  }

  if (isPlainObject(value)) {
    return (
      <div className="rounded-md border border-border p-3">
        <AutoDataForm data={value as Record<string, unknown>} onChange={(next) => onChange(next)} />
      </div>
    );
  }

  // Fallback: unrecognized shape (e.g. mixed arrays) — raw JSON snippet
  return (
    <textarea
      dir="ltr"
      value={JSON.stringify(value, null, 2)}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          /* keep typing until valid */
        }
      }}
      rows={4}
      className="w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-xs"
    />
  );
}
