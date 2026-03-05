#!/usr/bin/env python3
"""
Utility script to query the object localization database.
"""

import sqlite3
import argparse
from datetime import datetime
from pathlib import Path


def print_stats(db_path):
    """Print database statistics."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) FROM detections')
    total = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(DISTINCT object_name) FROM detections')
    unique = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM detections WHERE object_x IS NOT NULL')
    with_position = cursor.fetchone()[0]
    
    cursor.execute('SELECT COUNT(*) FROM detections WHERE camera_frame_jpeg IS NOT NULL')
    with_frame = cursor.fetchone()[0]
    
    print(f"\n=== Database Statistics ===")
    print(f"Total detections: {total}")
    print(f"Unique objects: {unique}")
    print(f"Detections with 3D position: {with_position}")
    print(f"Detections with camera frame: {with_frame}")
    
    cursor.execute('''
        SELECT object_name, COUNT(*) as count 
        FROM detections 
        GROUP BY object_name 
        ORDER BY count DESC 
        LIMIT 10
    ''')
    
    print(f"\nTop 10 detected objects:")
    for obj, count in cursor.fetchall():
        print(f"  {obj}: {count}")
    
    conn.close()


def list_recent(db_path, limit=20):
    """List recent detections."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute(f'''
        SELECT timestamp, object_name, object_x, object_y, object_z, 
               robot_x, robot_y, confidence
        FROM detections 
        ORDER BY timestamp DESC 
        LIMIT {limit}
    ''')
    
    print(f"\n=== Recent {limit} Detections ===")
    print(f"{'Time':<20} {'Object':<20} {'Object Pos (x,y,z)':<30} {'Robot Pos (x,y)':<20} {'Conf':<6}")
    print("-" * 100)
    
    for row in cursor.fetchall():
        ts, obj, ox, oy, oz, rx, ry, conf = row
        time_str = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
        
        if ox is not None:
            obj_pos = f"({ox:.2f}, {oy:.2f}, {oz:.2f})"
        else:
            obj_pos = "N/A"
        
        robot_pos = f"({rx:.2f}, {ry:.2f})"
        conf_str = f"{conf:.2f}" if conf else "N/A"
        
        print(f"{time_str:<20} {obj:<20} {obj_pos:<30} {robot_pos:<20} {conf_str:<6}")
    
    conn.close()


def search_object(db_path, object_name):
    """Search for specific object."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT timestamp, object_name, object_description, 
               object_x, object_y, object_z, confidence
        FROM detections 
        WHERE object_name LIKE ? AND object_x IS NOT NULL
        ORDER BY timestamp DESC
    ''', (f'%{object_name}%',))
    
    results = cursor.fetchall()
    
    print(f"\n=== Search Results for '{object_name}' ===")
    print(f"Found {len(results)} detections with 3D position")
    
    if results:
        print(f"\n{'Time':<20} {'Object':<20} {'Position (x,y,z)':<30} {'Confidence':<10}")
        print("-" * 85)
        
        for row in results:
            ts, obj, desc, ox, oy, oz, conf = row
            time_str = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
            pos = f"({ox:.2f}, {oy:.2f}, {oz:.2f})"
            conf_str = f"{conf:.2f}" if conf else "N/A"
            
            print(f"{time_str:<20} {obj:<20} {pos:<30} {conf_str:<10}")
    
    conn.close()


def export_csv(db_path, output_file):
    """Export database to CSV (without binary frame data)."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('PRAGMA table_info(detections)')
    all_columns = [col[1] for col in cursor.fetchall()]
    columns = [c for c in all_columns if c != 'camera_frame_jpeg']
    
    cursor.execute(f'SELECT {chr(44).join(columns)} FROM detections ORDER BY timestamp DESC')
    rows = cursor.fetchall()
    
    with open(output_file, 'w') as f:
        f.write(','.join(columns) + '\n')
        for row in rows:
            f.write(','.join(str(x) if x is not None else '' for x in row) + '\n')
    
    print(f"\nExported {len(rows)} detections to {output_file}")
    conn.close()


def export_frames(db_path, output_dir, object_filter=None, limit=None):
    """Export camera frames from database as JPEG files."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    query = '''
        SELECT id, timestamp, object_name, object_description, 
               object_x, object_y, object_z, camera_frame_jpeg
        FROM detections
        WHERE camera_frame_jpeg IS NOT NULL
    '''
    params = []
    
    if object_filter:
        query += ' AND object_name LIKE ?'
        params.append(f'%{object_filter}%')
    
    query += ' ORDER BY timestamp DESC'
    
    if limit:
        query += f' LIMIT {limit}'
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        print(f"No frames found" + (f" for '{object_filter}'" if object_filter else ""))
        return
    
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\nExporting {len(rows)} frames to {output_dir}/")
    
    for row in rows:
        det_id, ts, obj_name, desc, ox, oy, oz, jpeg_bytes = row
        time_str = datetime.fromtimestamp(ts).strftime('%Y%m%d_%H%M%S')
        safe_name = obj_name.replace('/', '_').replace(' ', '_')
        filename = f"{time_str}_{safe_name}_id{det_id}.jpg"
        filepath = out_path / filename
        
        with open(filepath, 'wb') as f:
            f.write(jpeg_bytes)
        
        pos_str = f"({ox:.2f}, {oy:.2f}, {oz:.2f})" if ox is not None else "N/A"
        print(f"  {filename}  |  pos={pos_str}  |  {desc[:60] if desc else ''}")
    
    print(f"\nDone. {len(rows)} frames saved to {output_dir}/")


def show_frame(db_path, detection_id):
    """Display a single camera frame by detection ID."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("Error: opencv-python required for frame display. Install with: pip install opencv-python")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, timestamp, object_name, object_description,
               object_x, object_y, object_z, confidence, camera_frame_jpeg
        FROM detections WHERE id = ?
    ''', (detection_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        print(f"Detection ID {detection_id} not found")
        return
    
    det_id, ts, obj_name, desc, ox, oy, oz, conf, jpeg_bytes = row
    
    if jpeg_bytes is None:
        print(f"Detection {detection_id} has no camera frame stored")
        return
    
    buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    
    time_str = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
    pos_str = f"({ox:.2f}, {oy:.2f}, {oz:.2f})" if ox is not None else "N/A"
    
    title = f"ID={det_id} | {obj_name} | pos={pos_str} | {time_str}"
    print(f"\n{title}")
    if desc:
        print(f"Description: {desc}")
    
    cv2.imshow(title, img)
    print("Press any key to close...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(description='Query object localization database')
    default_db = Path(__file__).resolve().parents[1] / 'data' / 'sensor_samples' / 'cosmos2' / 'objects.db'
    parser.add_argument('--db', default=str(default_db),
                       help='Path to database file')
    parser.add_argument('--stats', action='store_true',
                       help='Show database statistics')
    parser.add_argument('--recent', type=int, metavar='N',
                       help='List N most recent detections')
    parser.add_argument('--search', type=str, metavar='OBJECT',
                       help='Search for specific object')
    parser.add_argument('--export', type=str, metavar='FILE',
                       help='Export database to CSV file')
    parser.add_argument('--export-frames', type=str, metavar='DIR',
                       help='Export camera frames as JPEG files to directory')
    parser.add_argument('--frames-filter', type=str, metavar='OBJECT',
                       help='Filter frames by object name (use with --export-frames)')
    parser.add_argument('--frames-limit', type=int, metavar='N',
                       help='Limit number of exported frames (use with --export-frames)')
    parser.add_argument('--show-frame', type=int, metavar='ID',
                       help='Display camera frame for detection ID (requires opencv)')
    
    args = parser.parse_args()
    
    db_path = Path(args.db)
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        print("Make sure the object_localization_node has been run at least once.")
        return
    
    if args.stats:
        print_stats(db_path)
    
    if args.recent:
        list_recent(db_path, args.recent)
    
    if args.search:
        search_object(db_path, args.search)
    
    if args.export:
        export_csv(db_path, args.export)
    
    if args.export_frames:
        export_frames(db_path, args.export_frames,
                      object_filter=args.frames_filter,
                      limit=args.frames_limit)
    
    if args.show_frame:
        show_frame(db_path, args.show_frame)
    
    if not any([args.stats, args.recent, args.search, args.export,
                args.export_frames, args.show_frame]):
        print_stats(db_path)
        list_recent(db_path, 10)


if __name__ == '__main__':
    main()
