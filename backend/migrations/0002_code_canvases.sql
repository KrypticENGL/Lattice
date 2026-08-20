-- Code-Canvas node graphs (BLUEPRINT.md §4.3) and the derived Visualizer
-- canvases they generate.
--
-- BLUEPRINT §10 sketched one CANVASES entity holding both a `graph_data`
-- column and the code/trace. The shipped `canvases` table went the other
-- way — it is a Visualizer workspace (source + latest trace + resume step)
-- — so the graph gets its own table rather than being bolted onto a row
-- whose whole lifecycle is "run this code and remember where I was".

CREATE TABLE code_canvases (
    id UUID PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    -- The full node/edge graph as the canvas sends it. Stored whole rather
    -- than shredded into node/edge tables: nothing queries *into* a graph,
    -- it is always read and written as one document, and keeping it intact
    -- means the editor's own model is the storage format.
    graph JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX code_canvases_owner_updated_idx ON code_canvases (owner_id, updated_at DESC);

-- Provenance for a Visualizer canvas. 'user' is one somebody opened and
-- typed into; 'code_canvas' is one Lattice generated from a graph — its
-- source is derived, so it is read-only for as long as the graph it came
-- from still exists (see canvases::update / canvases::record_run).
ALTER TABLE canvases
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN code_canvas_id UUID REFERENCES code_canvases (id) ON DELETE SET NULL;

ALTER TABLE canvases
    ADD CONSTRAINT canvases_origin_check CHECK (origin IN ('user', 'code_canvas'));

-- ON DELETE SET NULL rather than CASCADE: deleting a graph shouldn't take
-- the traces it produced with it. Such a canvas keeps `origin =
-- 'code_canvas'` (the provenance mark is permanent) but, with no graph
-- left to desync from, becomes editable again — read-only is a property of
-- being *linked*, not of having once been generated.
CREATE INDEX canvases_code_canvas_idx ON canvases (code_canvas_id);

-- One derived canvas per graph. Re-pressing Visualize refreshes that one
-- canvas in place instead of littering the Visualizer with a new canvas
-- per click (see code_canvas::visualize's upsert).
CREATE UNIQUE INDEX canvases_code_canvas_unique_idx
    ON canvases (code_canvas_id)
    WHERE code_canvas_id IS NOT NULL;
