/**
 * Default Camera Sources — Isaac Sim
 *
 * Hardcoded camera list for Isaac Sim robots.
 * streamUrl = ROS topic name (routed through WS server).
 *
 * @see T1.3 — Isaac fixed cameras config
 */

import { type CameraSource } from '@/lib/types/camera'

export const DEFAULT_CAMERAS: readonly CameraSource[] = [
  {
    id: 'isaac-front-rgb',
    name: 'Front Camera (RGB)',
    kind: 'sim',
    streamUrl: '/robot0/front_cam/rgb',
    webrtcCapable: false,
    tags: ['isaac', 'front', 'rgb', 'navigation'],
    status: 'unknown',
  },
  {
    id: 'isaac-front-depth',
    name: 'Front Camera (Depth)',
    kind: 'sim',
    streamUrl: '/robot0/front_cam/depth',
    webrtcCapable: false,
    tags: ['isaac', 'front', 'depth'],
    status: 'unknown',
  },
  {
    id: 'isaac-rear-rgb',
    name: 'Rear Camera (RGB)',
    kind: 'sim',
    streamUrl: '/robot0/rear_cam/rgb',
    webrtcCapable: false,
    tags: ['isaac', 'rear', 'rgb'],
    status: 'unknown',
  },
] as const
