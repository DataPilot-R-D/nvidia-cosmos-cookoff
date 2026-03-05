/**
 * InteractiveJoystick Component
 *
 * Precision control joystick with visual feedback.
 * Inner element moves on mouse/touch interaction.
 *
 * Design References (Pencil):
 * - Control/Circle: 46px outer, 36px inner circles
 * - Border: #555555 outer, #333333 inner
 * - Active state uses CSS translate for movement
 *
 * @see plan.md Step 5: Precision Controls
 */

'use client'

import { useState, useCallback, useRef, useEffect, type HTMLAttributes } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface JoystickPosition {
  x: number // -1 to 1
  y: number // -1 to 1
}

export interface InteractiveJoystickProps extends HTMLAttributes<HTMLDivElement> {
  /** Callback when joystick position changes */
  onMove?: (position: JoystickPosition) => void
  /** Callback when joystick is released */
  onRelease?: () => void
  /** Size of joystick in pixels */
  size?: number
  /** Maximum movement range (0-1) */
  maxRange?: number
  /** Whether joystick is disabled */
  disabled?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function InteractiveJoystick({
  onMove,
  onRelease,
  size = 96,
  maxRange = 0.4,
  disabled = false,
  className = '',
  ...props
}: InteractiveJoystickProps) {
  const [position, setPosition] = useState<JoystickPosition>({ x: 0, y: 0 })
  const [isActive, setIsActive] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // Calculate inner knob translation
  const innerSize = size * 0.5
  const maxOffset = (size - innerSize) * maxRange
  const translateX = position.x * maxOffset
  const translateY = position.y * maxOffset

  const calculatePosition = useCallback(
    (clientX: number, clientY: number): JoystickPosition => {
      if (!containerRef.current) return { x: 0, y: 0 }

      const rect = containerRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const deltaX = clientX - centerX
      const deltaY = clientY - centerY

      // Normalize to -1 to 1 range
      const maxDelta = size / 2
      let x = deltaX / maxDelta
      let y = deltaY / maxDelta

      // Clamp to circular bounds
      const distance = Math.sqrt(x * x + y * y)
      if (distance > 1) {
        x /= distance
        y /= distance
      }

      return { x, y }
    },
    [size]
  )

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return
      isDragging.current = true
      setIsActive(true)
      const pos = calculatePosition(clientX, clientY)
      setPosition(pos)
      onMove?.(pos)
    },
    [disabled, calculatePosition, onMove]
  )

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging.current || disabled) return
      const pos = calculatePosition(clientX, clientY)
      setPosition(pos)
      onMove?.(pos)
    },
    [disabled, calculatePosition, onMove]
  )

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    setIsActive(false)
    setPosition({ x: 0, y: 0 })
    onRelease?.()
  }, [onRelease])

  // Mouse events
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      handleStart(e.clientX, e.clientY)
    },
    [handleStart]
  )

  // Touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      handleStart(touch.clientX, touch.clientY)
    },
    [handleStart]
  )

  // Global mouse/touch move and end handlers
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY)
    }

    const handleGlobalMouseUp = () => {
      handleEnd()
    }

    const handleGlobalTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      handleMove(touch.clientX, touch.clientY)
    }

    const handleGlobalTouchEnd = () => {
      handleEnd()
    }

    if (isActive) {
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true })
      window.addEventListener('touchend', handleGlobalTouchEnd)
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      window.removeEventListener('touchmove', handleGlobalTouchMove)
      window.removeEventListener('touchend', handleGlobalTouchEnd)
    }
  }, [isActive, handleMove, handleEnd])

  // Direction indicators based on position
  const showUp = position.y < -0.3
  const showDown = position.y > 0.3
  const showLeft = position.x < -0.3
  const showRight = position.x > 0.3

  return (
    <div
      ref={containerRef}
      className={`joystick-container ${isActive ? 'joystick-active' : ''} ${
        disabled ? 'joystick-disabled' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="slider"
      aria-label="Joystick control"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round(position.x * 100)}
      tabIndex={disabled ? -1 : 0}
      data-testid="joystick"
      {...props}
    >
      {/* Direction indicators */}
      <div className="joystick-directions">
        <div className={`joystick-direction joystick-dir-up ${showUp ? 'active' : ''}`} />
        <div className={`joystick-direction joystick-dir-down ${showDown ? 'active' : ''}`} />
        <div className={`joystick-direction joystick-dir-left ${showLeft ? 'active' : ''}`} />
        <div className={`joystick-direction joystick-dir-right ${showRight ? 'active' : ''}`} />
      </div>

      {/* Outer ring */}
      <div className="joystick-outer" />

      {/* Middle ring */}
      <div className="joystick-middle" />

      {/* Inner knob - moves with interaction */}
      <div
        className="joystick-inner"
        style={{
          width: innerSize,
          height: innerSize,
          transform: `translate(${translateX}px, ${translateY}px)`,
        }}
        data-testid="joystick-knob"
      />

      {/* Center dot */}
      <div className="joystick-center" />
    </div>
  )
}

export default InteractiveJoystick
