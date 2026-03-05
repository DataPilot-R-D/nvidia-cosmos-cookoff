/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@workspace/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    '^@react-three/fiber$': '<rootDir>/__mocks__/@react-three/fiber.js',
    '^@react-three/drei$': '<rootDir>/__mocks__/@react-three/drei.js',
    '^three$': '<rootDir>/__mocks__/three.js',
    '^@xyflow/react$': '<rootDir>/__mocks__/@xyflow/react.js',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json',
        useESM: false,
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@workspace)/)'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/index.ts', // Exclude re-export files
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}

module.exports = config
