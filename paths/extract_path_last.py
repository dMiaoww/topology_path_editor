#!/usr/bin/env python3
"""Grab the LAST /path message (nav_msgs/msg/Path) from a ROS2 rosbag, save its
poses, and check whether it really equals the accumulated /Odometry trajectory."""
import sys, sqlite3, numpy as np
from pathlib import Path
from rclpy.serialization import deserialize_message
from nav_msgs.msg import Path as NavPath
from nav_msgs.msg import Odometry

BAG = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/rizy/data/bag_nav/nav_20260707_141826")
db = next(BAG.glob("*.db3"))
c = sqlite3.connect(str(db)); cur = c.cursor()

def topic_id(name):
    return cur.execute("SELECT id FROM topics WHERE name=?", (name,)).fetchone()[0]

# --- last /path message by timestamp ---
tid_path = topic_id("/path")
ts_ns, data = cur.execute(
    "SELECT timestamp, data FROM messages WHERE topic_id=? ORDER BY timestamp DESC LIMIT 1",
    (tid_path,)).fetchone()
m = deserialize_message(data, NavPath)
n = len(m.poses)
xy = np.array([(p.pose.position.x, p.pose.position.y) for p in m.poses])
xyzq = np.array([(p.pose.position.x, p.pose.position.y, p.pose.position.z,
                  p.pose.orientation.x, p.pose.orientation.y, p.pose.orientation.z,
                  p.pose.orientation.w) for p in m.poses])

print("=== LAST /path message ===")
print(f"recv timestamp (ns) : {ts_ns}")
print(f"header.stamp        : {m.header.stamp.sec}.{m.header.stamp.nanosec:09d}")
print(f"frame_id            : '{m.header.frame_id}'")
print(f"#poses              : {n}")
print(f"x range             : [{xy[:,0].min():.3f}, {xy[:,0].max():.3f}]  (span {xy[:,0].ptp():.2f} m)")
print(f"y range             : [{xy[:,1].min():.3f}, {xy[:,1].max():.3f}]  (span {xy[:,1].ptp():.2f} m)")
print(f"first pose (x,y)    : ({xy[0,0]:.3f}, {xy[0,1]:.3f})")
print(f"last  pose (x,y)    : ({xy[-1,0]:.3f}, {xy[-1,1]:.3f})")

# --- does /path accumulate over time? compare first vs last ---
first_ts, first_data = cur.execute(
    "SELECT timestamp, data FROM messages WHERE topic_id=? ORDER BY timestamp ASC LIMIT 1",
    (tid_path,)).fetchone()
m0 = deserialize_message(first_data, NavPath)
print("\n=== first vs last /path ===")
print(f"first /path: {len(m0.poses)} poses @ t={first_ts/1e9:.2f}s")
print(f"last  /path: {n} poses @ t={ts_ns/1e9:.2f}s  -> grew by {n-len(m0.poses)}")

# --- compare against /Odometry trajectory ---
tid_odo = topic_id("/Odometry")
odo_rows = [r[0] for r in cur.execute(
    "SELECT data FROM messages WHERE topic_id=? ORDER BY timestamp ASC", (tid_odo,)).fetchall()]
odo_xy = np.array([(deserialize_message(d, Odometry).pose.pose.position.x,
                    deserialize_message(d, Odometry).pose.pose.position.y) for d in odo_rows])
print("\n=== /Odometry vs last /path ===")
print(f"/Odometry messages : {len(odo_rows)}")
print(f"/path poses (last) : {n}")
print(f"odo x range        : [{odo_xy[:,0].min():.3f}, {odo_xy[:,0].max():.3f}]")
print(f"odo y range        : [{odo_xy[:,1].min():.3f}, {odo_xy[:,1].max():.3f}]")
# how many odometry points already lie within the path's bbox / near a path point?
from scipy.spatial import cKDTree as KDTree
tree = KDTree(xy)
d_near, _ = tree.query(odo_xy, k=1)
print(f"odo→nearest path dist: median={np.median(d_near):.3f}m  p95={np.percentile(d_near,95):.3f}m  max={d_near.max():.3f}m")

# --- save outputs ---
out = BAG.parent / "path_last"
np.savetxt(str(out) + ".csv", xyzq,
           header="x,y,z,qx,qy,qz,qw", comments="", delimiter=",")
np.savez(str(out) + ".npz", pose_xyzq=xyzq, recv_ns=ts_ns,
         header_stamp_sec=m.header.stamp.sec, header_stamp_nsec=m.header.stamp.nanosec,
         frame_id=m.header.frame_id)
print(f"\nSaved: {out}.csv  (N={n})  and  {out}.npz")
c.close()
