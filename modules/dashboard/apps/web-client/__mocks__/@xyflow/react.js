/**
 * Mock for @xyflow/react (React Flow)
 *
 * Provides mock implementations for testing without canvas.
 */

const React = require('react')

// Mock ReactFlow component
const ReactFlow = ({ children, nodes = [], edges = [], style = {} }) => {
  return React.createElement(
    'div',
    {
      'data-testid': 'react-flow',
      style: { width: '100%', height: '100%', ...style },
    },
    children
  )
}

// Mock Background component
const Background = () => null
const BackgroundVariant = {
  Dots: 'dots',
  Lines: 'lines',
  Cross: 'cross',
}

// Mock Controls component
const Controls = () => null

// Mock MiniMap component
const MiniMap = () => null

// Mock useNodesState hook
const useNodesState = (initialNodes = []) => {
  const [nodes, setNodes] = React.useState(initialNodes)
  const onNodesChange = jest.fn()
  return [nodes, setNodes, onNodesChange]
}

// Mock useEdgesState hook
const useEdgesState = (initialEdges = []) => {
  const [edges, setEdges] = React.useState(initialEdges)
  const onEdgesChange = jest.fn()
  return [edges, setEdges, onEdgesChange]
}

// Mock ReactFlowProvider
const ReactFlowProvider = ({ children }) => {
  return React.createElement(React.Fragment, null, children)
}

// Mock useReactFlow hook
const useReactFlow = () => ({
  getNodes: jest.fn(() => []),
  getEdges: jest.fn(() => []),
  setNodes: jest.fn(),
  setEdges: jest.fn(),
  fitView: jest.fn(),
  zoomIn: jest.fn(),
  zoomOut: jest.fn(),
  getViewport: jest.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  setViewport: jest.fn(),
  screenToFlowPosition: jest.fn((pos) => pos),
  flowToScreenPosition: jest.fn((pos) => pos),
})

// Mock Panel component
const Panel = ({ children, position }) => {
  return React.createElement('div', { 'data-testid': 'react-flow-panel' }, children)
}

module.exports = {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Panel,
}
