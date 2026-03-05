/* @ts-self-types="./wasm_processing.d.ts" */

/**
 * Decode base64 OccupancyGrid data to Uint8Array
 *
 * Converts signed int8 (-1 = unknown, 0-100 = probability) to unsigned
 * for efficient canvas rendering.
 *
 * # Arguments
 * * `base64_data` - Base64 encoded grid data
 *
 * # Returns
 * Uint8Array where -1 becomes 255 (unknown), 0-100 stay as-is
 * @param {string} base64_data
 * @returns {Uint8Array}
 */
function decode_occupancy_grid(base64_data) {
  const ptr0 = passStringToWasm0(base64_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
  const len0 = WASM_VECTOR_LEN
  const ret = wasm.decode_occupancy_grid(ptr0, len0)
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1])
  }
  return takeFromExternrefTable0(ret[0])
}
exports.decode_occupancy_grid = decode_occupancy_grid

/**
 * Find frontier cells in an occupancy grid
 *
 * Frontiers are free cells adjacent to unknown cells.
 * Used for exploration planning.
 *
 * # Arguments
 * * `grid_data` - Uint8Array of grid cells (0=free, 100=occupied, 255=unknown)
 * * `width` - Grid width
 * * `height` - Grid height
 *
 * # Returns
 * Uint8Array where 1 = frontier cell, 0 = not frontier
 * @param {Uint8Array} grid_data
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
function find_frontiers(grid_data, width, height) {
  const ret = wasm.find_frontiers(grid_data, width, height)
  return ret
}
exports.find_frontiers = find_frontiers

/**
 * Get WASM module version
 * @returns {string}
 */
function get_version() {
  let deferred1_0
  let deferred1_1
  try {
    const ret = wasm.get_version()
    deferred1_0 = ret[0]
    deferred1_1 = ret[1]
    return getStringFromWasm0(ret[0], ret[1])
  } finally {
    wasm.__wbindgen_free(deferred1_0, deferred1_1, 1)
  }
}
exports.get_version = get_version

/**
 * Process LaserScan: convert polar coordinates to Cartesian
 *
 * # Arguments
 * * `ranges` - Float32Array of distance measurements
 * * `angle_min` - Start angle in radians
 * * `angle_increment` - Angle step between measurements
 *
 * # Returns
 * Float32Array with [x,y,z,intensity] tuples flattened (z=0 for 2D scan)
 * @param {Float32Array} ranges
 * @param {number} angle_min
 * @param {number} angle_increment
 * @returns {Float32Array}
 */
function process_laserscan(ranges, angle_min, angle_increment) {
  const ret = wasm.process_laserscan(ranges, angle_min, angle_increment)
  return ret
}
exports.process_laserscan = process_laserscan

/**
 * Process PointCloud2 binary data
 *
 * This is the main workhorse function that:
 * 1. Decodes base64 data
 * 2. Parses binary buffer according to ROS PointCloud2 format
 * 3. Applies decimation (skip factor)
 * 4. Filters NaN/Infinity and origin points
 * 5. Returns flat Float32Array [x1,y1,z1,i1, x2,y2,z2,i2, ...]
 *
 * # Arguments
 * * `base64_data` - Base64 encoded binary point cloud data
 * * `point_step` - Bytes per point (typically 12-32)
 * * `x_offset` - Byte offset to X field
 * * `y_offset` - Byte offset to Y field
 * * `z_offset` - Byte offset to Z field
 * * `max_points` - Maximum points to return (decimation applied if exceeded)
 *
 * # Returns
 * Float32Array with [x,y,z,intensity] tuples flattened
 * @param {string} base64_data
 * @param {number} point_step
 * @param {number} x_offset
 * @param {number} y_offset
 * @param {number} z_offset
 * @param {number} max_points
 * @returns {Float32Array}
 */
function process_pointcloud2(base64_data, point_step, x_offset, y_offset, z_offset, max_points) {
  const ptr0 = passStringToWasm0(base64_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
  const len0 = WASM_VECTOR_LEN
  const ret = wasm.process_pointcloud2(
    ptr0,
    len0,
    point_step,
    x_offset,
    y_offset,
    z_offset,
    max_points
  )
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1])
  }
  return takeFromExternrefTable0(ret[0])
}
exports.process_pointcloud2 = process_pointcloud2

function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg___wbindgen_throw_be289d5034ed271b: function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1))
    },
    __wbg_error_7534b8e9a36f1ab4: function (arg0, arg1) {
      let deferred0_0
      let deferred0_1
      try {
        deferred0_0 = arg0
        deferred0_1 = arg1
        console.error(getStringFromWasm0(arg0, arg1))
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1)
      }
    },
    __wbg_get_index_80a69050a46aaf91: function (arg0, arg1) {
      const ret = arg0[arg1 >>> 0]
      return ret
    },
    __wbg_length_32ed9a279acd054c: function (arg0) {
      const ret = arg0.length
      return ret
    },
    __wbg_length_9a7876c9728a0979: function (arg0) {
      const ret = arg0.length
      return ret
    },
    __wbg_new_8a6f238a6ece86ea: function () {
      const ret = new Error()
      return ret
    },
    __wbg_new_with_length_63f2683cc2521026: function (arg0) {
      const ret = new Float32Array(arg0 >>> 0)
      return ret
    },
    __wbg_new_with_length_a2c39cbe88fd8ff1: function (arg0) {
      const ret = new Uint8Array(arg0 >>> 0)
      return ret
    },
    __wbg_prototypesetcall_bdcdcc5842e4d77d: function (arg0, arg1, arg2) {
      Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2)
    },
    __wbg_set_cc56eefd2dd91957: function (arg0, arg1, arg2) {
      arg0.set(getArrayU8FromWasm0(arg1, arg2))
    },
    __wbg_set_f8edeec46569cc70: function (arg0, arg1, arg2) {
      arg0.set(getArrayF32FromWasm0(arg1, arg2))
    },
    __wbg_stack_0ed75d68575b0f3c: function (arg0, arg1) {
      const ret = arg1.stack
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
      const len1 = WASM_VECTOR_LEN
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true)
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true)
    },
    __wbindgen_cast_0000000000000001: function (arg0, arg1) {
      // Cast intrinsic for `Ref(String) -> Externref`.
      const ret = getStringFromWasm0(arg0, arg1)
      return ret
    },
    __wbindgen_init_externref_table: function () {
      const table = wasm.__wbindgen_externrefs
      const offset = table.grow(4)
      table.set(0, undefined)
      table.set(offset + 0, undefined)
      table.set(offset + 1, null)
      table.set(offset + 2, true)
      table.set(offset + 3, false)
    },
  }
  return {
    __proto__: null,
    './wasm_processing_bg.js': import0,
  }
}

function getArrayF32FromWasm0(ptr, len) {
  ptr = ptr >>> 0
  return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len)
}

function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len)
}

let cachedDataViewMemory0 = null
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer)
  }
  return cachedDataViewMemory0
}

let cachedFloat32ArrayMemory0 = null
function getFloat32ArrayMemory0() {
  if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
    cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer)
  }
  return cachedFloat32ArrayMemory0
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0
  return decodeText(ptr, len)
}

let cachedUint8ArrayMemory0 = null
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)
  }
  return cachedUint8ArrayMemory0
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg)
    const ptr = malloc(buf.length, 1) >>> 0
    getUint8ArrayMemory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf)
    WASM_VECTOR_LEN = buf.length
    return ptr
  }

  let len = arg.length
  let ptr = malloc(len, 1) >>> 0

  const mem = getUint8ArrayMemory0()

  let offset = 0

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset)
    if (code > 0x7f) break
    mem[ptr + offset] = code
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset)
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3), 1) >>> 0
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len)
    const ret = cachedTextEncoder.encodeInto(arg, view)

    offset += ret.written
    ptr = realloc(ptr, len, offset, 1) >>> 0
  }

  WASM_VECTOR_LEN = offset
  return ptr
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx)
  wasm.__externref_table_dealloc(idx)
  return value
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
cachedTextDecoder.decode()
function decodeText(ptr, len) {
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len))
}

const cachedTextEncoder = new TextEncoder()

if (!('encodeInto' in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg)
    view.set(buf)
    return {
      read: arg.length,
      written: buf.length,
    }
  }
}

let WASM_VECTOR_LEN = 0

const wasmPath = `${__dirname}/wasm_processing_bg.wasm`
const wasmBytes = require('fs').readFileSync(wasmPath)
const wasmModule = new WebAssembly.Module(wasmBytes)
const wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports
wasm.__wbindgen_start()
