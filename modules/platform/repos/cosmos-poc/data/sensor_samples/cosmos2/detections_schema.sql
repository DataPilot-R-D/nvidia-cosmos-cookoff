CREATE TABLE detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    object_name TEXT NOT NULL,
    object_description TEXT,
    robot_x REAL NOT NULL,
    robot_y REAL NOT NULL,
    robot_z REAL NOT NULL,
    object_x REAL,
    object_y REAL,
    object_z REAL,
    confidence REAL,
    bbox_x_min INTEGER,
    bbox_y_min INTEGER,
    bbox_x_max INTEGER,
    bbox_y_max INTEGER,
    frame_id TEXT
);

CREATE INDEX idx_timestamp ON detections(timestamp);
CREATE INDEX idx_object_name ON detections(object_name);
