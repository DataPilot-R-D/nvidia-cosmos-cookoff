/**
 * Mock next/dynamic for Jest — resolves dynamic imports synchronously.
 */
const dynamic = (loader, _options) => {
  let Component = null

  // Try to resolve the loader synchronously
  const promise = loader()
  promise.then((mod) => {
    // If the loader returns a component directly (from .then(m => m.X))
    Component = mod.default || mod
  })

  // Return a wrapper that renders the resolved component
  const DynamicComponent = (props) => {
    if (!Component) return null
    return require('react').createElement(Component, props)
  }
  DynamicComponent.displayName = 'DynamicComponent'
  return DynamicComponent
}

module.exports = dynamic
module.exports.default = dynamic
