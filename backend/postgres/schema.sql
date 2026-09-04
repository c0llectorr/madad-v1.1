-- MADAD schema — verbatim from MADAD_DATABASE.md Section 1

CREATE TABLE support_centers (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(120) NOT NULL,
    region      VARCHAR(80),
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    center_id      INTEGER REFERENCES support_centers(id) ON DELETE CASCADE,
    -- NULL only for Administrators. A coordinator row must always have a center_id --
    -- enforced in app code (MADAD_BACKEND.md Story A2), not here, since one column
    -- can't carry two different nullability rules for two different roles.
    username       VARCHAR(60) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(20) NOT NULL CHECK (role IN ('administrator', 'coordinator')),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_by     INTEGER REFERENCES users(id),
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reports (
    id             SERIAL PRIMARY KEY,
    center_id      INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
    submitted_by   INTEGER REFERENCES users(id),
    source         VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sms_stub')),
    raw_text       TEXT,
    extracted_json JSONB,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending_extraction'
                   CHECK (status IN ('pending_extraction', 'extracted', 'confirmed', 'rejected')),
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sites (
    id                    SERIAL PRIMARY KEY,
    center_id             INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
    report_id             INTEGER REFERENCES reports(id) ON DELETE SET NULL,
    location_name         VARCHAR(150) NOT NULL,
    lat                   DOUBLE PRECISION NOT NULL,
    lng                   DOUBLE PRECISION NOT NULL,
    estimated_population  INTEGER NOT NULL DEFAULT 0,
    needs                 JSONB NOT NULL DEFAULT '[]',
    urgency_flags         JSONB NOT NULL DEFAULT '[]',
    severity              VARCHAR(20) CHECK (severity IN ('low','medium','high','critical') OR severity IS NULL),
    confidence            VARCHAR(20) NOT NULL DEFAULT 'single_unverified'
                          CHECK (confidence IN ('single_unverified', 'corroborated')),
    priority_score        DOUBLE PRECISION,
    status                VARCHAR(20) NOT NULL DEFAULT 'unserved'
                          CHECK (status IN ('unserved', 'planned', 'dispatched', 'delivered')),
    last_report_time      TIMESTAMPTZ DEFAULT now(),
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE depots (
    id          SERIAL PRIMARY KEY,
    center_id   INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory (
    id             SERIAL PRIMARY KEY,
    depot_id       INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
    resource_type  VARCHAR(40) NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (depot_id, resource_type)
);

CREATE TABLE dispatches (
    id               SERIAL PRIMARY KEY,
    center_id        INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
    site_id          INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    depot_id         INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
    dispatched_by    INTEGER REFERENCES users(id),
    resources_loaded JSONB NOT NULL,
    route_geojson    JSONB,
    distance_km      DOUBLE PRECISION,
    eta_minutes      INTEGER,
    status           VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'en_route', 'delivered')),
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Damage-aware routing: edges are snapped ONCE, at report time, and cached here.
CREATE TABLE damaged_roads (
    id              SERIAL PRIMARY KEY,
    center_id       INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
    reported_by     INTEGER REFERENCES users(id),
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    edge_u          BIGINT NOT NULL,    -- OSMnx graph node ID, snapped once at report time
    edge_v          BIGINT NOT NULL,    -- OSMnx graph node ID, snapped once at report time
    edge_geometry   JSONB,              -- GeoJSON of the exact severed road segment, for map display
    reason          VARCHAR(200),
    active          BOOLEAN NOT NULL DEFAULT true,
    reported_at     TIMESTAMPTZ DEFAULT now()
);

-- Audit log of every reroute event.
CREATE TABLE dispatch_reroutes (
    id               SERIAL PRIMARY KEY,
    dispatch_id      INTEGER NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
    triggered_by     INTEGER REFERENCES users(id),
    current_lat      DOUBLE PRECISION NOT NULL,
    current_lng      DOUBLE PRECISION NOT NULL,
    old_eta_minutes  INTEGER,
    new_eta_minutes  INTEGER,
    reason           VARCHAR(200),
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sites_center_status ON sites(center_id, status);
CREATE INDEX idx_dispatches_center_status ON dispatches(center_id, status);
CREATE INDEX idx_reports_center_status ON reports(center_id, status);
CREATE INDEX idx_users_center_role ON users(center_id, role);
CREATE INDEX idx_damaged_roads_center_active ON damaged_roads(center_id, active);

-- Driver assignment (v1.1): one coordinator may be assigned to at most one
-- active dispatch; availability flips available <-> on_route.
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_dispatches_assigned ON dispatches(assigned_to) WHERE assigned_to IS NOT NULL;

-- v1.2: driver role + persisted AI plans
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('administrator', 'coordinator', 'driver'));

CREATE TABLE IF NOT EXISTS drivers (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  depot_id   INTEGER NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  status     VARCHAR(20) NOT NULL DEFAULT 'available'
             CHECK (status IN ('available', 'on_route')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drivers_depot ON drivers(depot_id);

CREATE TABLE IF NOT EXISTS plans (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  center_id    INTEGER NOT NULL REFERENCES support_centers(id) ON DELETE CASCADE,
  generated_by INTEGER REFERENCES users(id),
  source       VARCHAR(10) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  reasoning    TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'assigned')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_items (
  id            SERIAL PRIMARY KEY,
  plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  resource_type VARCHAR(40) NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  UNIQUE (plan_id, resource_type)
);

ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES plans(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id);
CREATE INDEX IF NOT EXISTS idx_dispatches_driver ON dispatches(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_site ON plans(site_id);
