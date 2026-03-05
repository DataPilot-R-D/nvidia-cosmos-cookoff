/**
 * Mock for Three.js
 *
 * Provides mock implementations for testing without WebGL.
 */

class BufferGeometry {
  constructor() {
    this.attributes = {}
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute
  }
  setDrawRange() {}
  dispose() {}
  computeBoundingSphere() {}
}

class Float32BufferAttribute {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
  }
  setUsage() {
    return this
  }
}

class Points {
  constructor(geometry, material) {
    this.geometry = geometry
    this.material = material
    this.rotation = { x: 0, y: 0, z: 0 }
  }
}

class PointsMaterial {
  constructor(params = {}) {
    Object.assign(this, params)
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }
  set(x, y, z) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
}

class Scene {
  constructor() {
    this.children = []
  }
  add(object) {
    this.children.push(object)
  }
  remove(object) {
    const index = this.children.indexOf(object)
    if (index > -1) {
      this.children.splice(index, 1)
    }
  }
}

class PerspectiveCamera {
  constructor(fov, aspect, near, far) {
    this.fov = fov
    this.aspect = aspect
    this.near = near
    this.far = far
    this.position = new Vector3()
    this.rotation = { x: 0, y: 0, z: 0 }
  }
  lookAt() {}
  updateProjectionMatrix() {}
}

class BoxGeometry {
  constructor(width, height, depth) {
    this.width = width
    this.height = height
    this.depth = depth
  }
}

class ConeGeometry {
  constructor(radius, height, segments) {
    this.radius = radius
    this.height = height
    this.segments = segments
  }
}

class MeshStandardMaterial {
  constructor(params = {}) {
    Object.assign(this, params)
  }
}

class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry
    this.material = material
    this.position = new Vector3()
    this.rotation = { x: 0, y: 0, z: 0 }
  }
}

class Group {
  constructor() {
    this.children = []
    this.position = new Vector3()
    this.rotation = { x: 0, y: 0, z: 0 }
  }
  add(object) {
    this.children.push(object)
  }
}

module.exports = {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Vector3,
  Scene,
  PerspectiveCamera,
  BoxGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  Mesh,
  Group,
  DynamicDrawUsage: 35,
}
