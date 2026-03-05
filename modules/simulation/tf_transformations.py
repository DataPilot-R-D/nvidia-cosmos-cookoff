"""Shim for tf_transformations using transforms3d"""
import transforms3d
import numpy as np

def quaternion_from_euler(ai, aj, ak, axes="sxyz"):
    q = transforms3d.euler.euler2quat(ai, aj, ak, axes)
    # transforms3d returns (w,x,y,z), tf_transformations returns (x,y,z,w)
    return np.array([q[1], q[2], q[3], q[0]])

def euler_from_quaternion(q):
    # q = (x,y,z,w) -> transforms3d wants (w,x,y,z)
    return transforms3d.euler.quat2euler([q[3], q[0], q[1], q[2]])
