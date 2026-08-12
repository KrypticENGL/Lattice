CREATE TABLE canvases (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'cpp',
    source_code TEXT NOT NULL DEFAULT '',
    trace_data JSONB,
    stdout TEXT,
    compile_command TEXT,
    compiler_output TEXT,
    truncated BOOLEAN NOT NULL DEFAULT false,
    step_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX canvases_owner_updated_idx ON canvases (owner_id, updated_at DESC);
