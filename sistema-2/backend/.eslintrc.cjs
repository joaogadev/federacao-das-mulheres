module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  ignorePatterns: ['dist', 'node_modules'],
  rules: { 'no-constant-condition': 'error', 'no-unreachable': 'error', 'eqeqeq': 'error' },
};
