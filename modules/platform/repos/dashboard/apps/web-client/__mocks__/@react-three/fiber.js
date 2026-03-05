/**
 * Mock for @react-three/fiber
 *
 * Provides mock implementations for testing without WebGL.
 */

const React = require('react')

// Mock Canvas component
const Canvas = ({ children }) => {
  return React.createElement('div', { 'data-testid': 'r3f-canvas' }, children)
}

// Mock hooks
const useFrame = jest.fn()
const useThree = jest.fn(() => ({
  camera: {},
  scene: {},
  gl: {},
  size: { width: 800, height: 600 },
}))
const useLoader = jest.fn()

// Mock extend
const extend = jest.fn()

module.exports = {
  Canvas,
  useFrame,
  useThree,
  useLoader,
  extend,
}
