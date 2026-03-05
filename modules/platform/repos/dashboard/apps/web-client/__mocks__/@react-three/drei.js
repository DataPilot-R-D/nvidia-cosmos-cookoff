/**
 * Mock for @react-three/drei
 *
 * Provides mock implementations for testing without WebGL.
 */

const React = require('react')

// Mock OrbitControls
const OrbitControls = () => null

// Mock PerspectiveCamera
const PerspectiveCamera = ({ children }) => {
  return React.createElement('group', { 'data-testid': 'perspective-camera' }, children)
}

// Mock Grid
const Grid = () => null

// Mock Html
const Html = ({ children }) => {
  return React.createElement('div', { 'data-testid': 'drei-html' }, children)
}

// Mock Text
const Text = ({ children }) => {
  return React.createElement('span', { 'data-testid': 'drei-text' }, children)
}

module.exports = {
  OrbitControls,
  PerspectiveCamera,
  Grid,
  Html,
  Text,
}
