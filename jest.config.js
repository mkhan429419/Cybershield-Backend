module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  clearMocks: true,
  testTimeout: 30000,
};
